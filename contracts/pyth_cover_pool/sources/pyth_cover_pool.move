/// Backstop DepegCoverPool — a mainnet, fully-collateralized parametric cover
/// pool that settles TRUSTLESSLY against a Pyth Network price feed.
///
/// A pool insures one asset (one Pyth feed id) against breaking below a `threshold`
/// price — e.g. a stablecoin depeg ("pay if suiUSDe < $0.97"). LPs supply capital
/// and earn premiums; a holder buys cover; and when Pyth reports the insured asset
/// at or below the threshold, the holder claims a payout straight from the pool.
///
/// The settlement read uses `pyth::pyth::get_price_no_older_than`, which aborts on a
/// stale price by construction — so there is no Backstop-controlled value, and no
/// stale-oracle, in the payout path. Premium *pricing* is set off-chain by whoever
/// seeds the pool (the `premium_bps` rate); settlement is the only thing that must
/// be objective, and it is. Pricing-subjective / settlement-objective is the whole
/// design: nobody has to trust Backstop to get paid.
///
/// The pool is always fully collateralized: `value(funds) >= total_cover`.
///
/// Settlement requires a SUSTAINED breach (dwell), never a single read — there is no
/// native on-chain TWAP on Sui, so the dwell is built on the latch: `record_breach`
/// must observe the feed at/below the threshold twice, at least `min_dwell_secs`
/// apart (each read fresh, conf-banded, and feed-matched). The first observation
/// *arms* the policy; a confirming observation after the dwell window *latches* it,
/// after which `claim_latched` pays — even once the price recovers or the policy
/// expires. This converts a transient wick or a single manipulated update into a
/// required sustained depeg, which is the only thing a depeg payout should pay on.
module pyth_cover_pool::pyth_cover_pool {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::event;
    use pyth::pyth;
    use pyth::price;
    use pyth::price_info::{Self, PriceInfoObject};
    use pyth::price_identifier;
    use pyth::i64;

    /// Basis-points denominator.
    const BPS: u128 = 10_000;

    /// Cover or deposit amount must be non-zero.
    const EZeroAmount: u64 = 0;
    /// Premium paid is less than the pool-priced premium.
    const EInsufficientPremium: u64 = 1;
    /// Pool cannot back the requested cover (would break full collateralization).
    const EInsolvent: u64 = 2;
    /// Policy/LP share belongs to a different pool.
    const EWrongPool: u64 = 3;
    /// Policy has expired (claim) / has not yet expired (expire_policy).
    const EPolicyExpired: u64 = 4;
    const ENotExpired: u64 = 5;
    /// Insured asset is above the depeg threshold — no payout.
    const ENotDepegged: u64 = 6;
    /// The supplied PriceInfoObject is not the pool's insured feed.
    const EWrongFeed: u64 = 7;
    /// Price exponent does not match the pool's expected scale.
    const EBadExpo: u64 = 8;
    /// Pyth reported a negative price (should be impossible for a USD feed).
    const ENegativePrice: u64 = 9;
    /// Computed premium rounds to zero (dust cover) — reject free cover.
    const EZeroPremium: u64 = 10;
    /// claim_latched on a policy that was never recorded as breached.
    const ENotBreached: u64 = 11;
    /// A latched (still-claimable) policy cannot be expired out from under the holder.
    const EBreachedCannotExpire: u64 = 12;
    /// Pyth confidence interval too wide vs price — the read is not trustworthy.
    const EConfTooWide: u64 = 13;
    /// Breach recorded before the policy's activation delay elapsed (anti-adverse
    /// selection: cover bought at the instant of a depeg is not yet claimable).
    const ENotActive: u64 = 14;
    /// Policy would expire at or before it activates — it could never pay out.
    const EExpiryBeforeActivation: u64 = 15;
    /// Requested cover exceeds the pool's per-policy cover cap.
    const EPolicyCoverCap: u64 = 16;
    /// Requested cover would push the pool's total cover past its aggregate cap.
    const EPoolCoverCap: u64 = 17;

    /// Shared mutualized depeg-cover pool insuring one Pyth feed in coin `T`.
    public struct DepegCoverPool<phantom T> has key {
        id: UID,
        /// 32-byte Pyth price feed id this pool insures (e.g. suiUSDe/USD).
        feed_id: vector<u8>,
        /// Expected price exponent of the feed: sign + magnitude (USD feeds are
        /// negative, e.g. expo -8 -> (true, 8)). Pins the `threshold` scale.
        expo_neg: bool,
        expo_mag: u64,
        /// Depeg trigger: claim pays when the feed price magnitude is <= this,
        /// expressed at the pool's expected exponent (e.g. $0.97 @ expo -8 = 97_000_000).
        threshold: u64,
        /// Max Pyth price age (seconds) accepted at settlement.
        max_age_secs: u64,
        /// Base premium rate (bps) charged at 0% utilization — the floor of the curve.
        premium_bps: u64,
        /// Additional premium rate (bps) at 100% utilization. The charged rate scales
        /// linearly: rate = premium_bps + surge_premium_bps * utilization, so capacity
        /// is rationed (priced up) as the pool fills with cover during a depeg scare.
        surge_premium_bps: u64,
        /// Reject a settlement read whose Pyth confidence/price ratio exceeds this
        /// (bps) — never settle while the oracle itself signals high uncertainty.
        max_conf_bps: u64,
        /// Minimum time a breach must persist between the arming and confirming reads
        /// before a policy latches (seconds). Turns a wick into a sustained depeg.
        min_dwell_secs: u64,
        /// A freshly bought policy cannot record a breach until this many seconds after
        /// purchase — kills buying cover at the instant of a depeg (adverse selection).
        activation_delay_secs: u64,
        /// Max cover a single policy may buy (0 = no per-policy limit). Caps the blow-up
        /// from one whale concentrating the pool's correlated risk in one position.
        max_cover_per_policy: u64,
        /// Max aggregate `total_cover` the pool will underwrite (0 = bounded only by
        /// full collateralization). A hard ceiling on the pool's correlated exposure.
        max_total_cover: u64,
        /// Pooled capital: LP deposits + collected premiums.
        funds: Balance<T>,
        /// Total LP shares outstanding.
        total_shares: u64,
        /// Sum of cover on active policies — the pool's outstanding liability.
        total_cover: u64,
    }

    /// An LP's claim on the pool, redeemable for a proportional slice of `funds`.
    public struct LpShare<phantom T> has key, store {
        id: UID,
        pool_id: ID,
        shares: u64,
    }

    /// A parametric depeg-cover policy: pays `cover` if the feed breaches the
    /// pool threshold before `expiry_ms`.
    public struct Policy<phantom T> has key, store {
        id: UID,
        pool_id: ID,
        cover: u64,
        premium_paid: u64,
        expiry_ms: u64,
        /// No breach may be recorded before this time (ms) — the activation delay.
        activation_ms: u64,
        /// True once the first sub-threshold observation has started the dwell window.
        armed: bool,
        /// Timestamp (ms) of that first observation (only meaningful while `armed`).
        first_breach_ms: u64,
        /// Set once a confirming sub-threshold read lands at least `min_dwell_secs`
        /// after `first_breach_ms`, so the holder can `claim_latched` later — even
        /// after the price recovers or the policy expires.
        breached: bool,
        breach_price: u64,
    }

    public struct PoolCreated has copy, drop {
        pool: ID,
        feed_id: vector<u8>,
        threshold: u64,
        premium_bps: u64,
    }

    public struct CoverBought has copy, drop {
        pool: ID,
        cover: u64,
        premium: u64,
        expiry_ms: u64,
    }

    public struct Claimed has copy, drop {
        pool: ID,
        cover: u64,
        price: u64,
    }

    /// First sub-threshold observation — the dwell window starts now.
    public struct BreachArmed has copy, drop {
        pool: ID,
        price: u64,
        at_ms: u64,
    }

    /// Confirming sub-threshold observation after the dwell window — policy latched.
    public struct BreachConfirmed has copy, drop {
        pool: ID,
        price: u64,
    }

    // --- Pool lifecycle ---

    public fun new_pool<T>(
        feed_id: vector<u8>,
        expo_neg: bool,
        expo_mag: u64,
        threshold: u64,
        max_age_secs: u64,
        premium_bps: u64,
        surge_premium_bps: u64,
        max_conf_bps: u64,
        min_dwell_secs: u64,
        activation_delay_secs: u64,
        max_cover_per_policy: u64,
        max_total_cover: u64,
        ctx: &mut TxContext,
    ): DepegCoverPool<T> {
        DepegCoverPool {
            id: object::new(ctx),
            feed_id,
            expo_neg,
            expo_mag,
            threshold,
            max_age_secs,
            premium_bps,
            surge_premium_bps,
            max_conf_bps,
            min_dwell_secs,
            activation_delay_secs,
            max_cover_per_policy,
            max_total_cover,
            funds: balance::zero<T>(),
            total_shares: 0,
            total_cover: 0,
        }
    }

    /// Create and share a depeg-cover pool insuring `feed_id` below `threshold`.
    public entry fun create_and_share<T>(
        feed_id: vector<u8>,
        expo_neg: bool,
        expo_mag: u64,
        threshold: u64,
        max_age_secs: u64,
        premium_bps: u64,
        surge_premium_bps: u64,
        max_conf_bps: u64,
        min_dwell_secs: u64,
        activation_delay_secs: u64,
        max_cover_per_policy: u64,
        max_total_cover: u64,
        ctx: &mut TxContext,
    ) {
        let pool = new_pool<T>(
            feed_id, expo_neg, expo_mag, threshold, max_age_secs, premium_bps,
            surge_premium_bps, max_conf_bps, min_dwell_secs, activation_delay_secs,
            max_cover_per_policy, max_total_cover, ctx,
        );
        event::emit(PoolCreated {
            pool: object::id(&pool),
            feed_id: pool.feed_id,
            threshold,
            premium_bps,
        });
        transfer::share_object(pool);
    }

    // --- Liquidity provision ---

    /// Supply capital and receive LP shares, minted pro-rata to the pool's value
    /// before this deposit (the first deposit anchors 1 share = 1 unit).
    public fun deposit_lp<T>(
        pool: &mut DepegCoverPool<T>,
        coin: Coin<T>,
        ctx: &mut TxContext,
    ): LpShare<T> {
        let amount = coin::value(&coin);
        assert!(amount > 0, EZeroAmount);
        let value_before = balance::value(&pool.funds);
        let shares = if (pool.total_shares == 0 || value_before == 0) {
            amount
        } else {
            (((amount as u128) * (pool.total_shares as u128)) / (value_before as u128)) as u64
        };
        balance::join(&mut pool.funds, coin::into_balance(coin));
        pool.total_shares = pool.total_shares + shares;
        LpShare { id: object::new(ctx), pool_id: object::id(pool), shares }
    }

    /// Redeem LP shares for a proportional slice of the pool. Cannot drain the
    /// capital backing outstanding cover (full-collateralization invariant).
    public fun withdraw_lp<T>(
        pool: &mut DepegCoverPool<T>,
        share: LpShare<T>,
        ctx: &mut TxContext,
    ): Coin<T> {
        let LpShare { id, pool_id, shares } = share;
        assert!(pool_id == object::id(pool), EWrongPool);
        object::delete(id);
        let value = balance::value(&pool.funds);
        let payout = (((shares as u128) * (value as u128)) / (pool.total_shares as u128)) as u64;
        pool.total_shares = pool.total_shares - shares;
        assert!(value - payout >= pool.total_cover, EInsolvent);
        coin::take(&mut pool.funds, payout, ctx)
    }

    // --- Cover ---

    /// Utilization-based premium rate (bps) for adding `cover`: the rate rises with
    /// the post-trade utilization `(total_cover + cover) / pool_value`, so buying cover
    /// into a pool that is filling up (a depeg scare) costs more — capacity is rationed.
    /// `rate = premium_bps + surge_premium_bps * utilization` (utilization clamped to 1).
    public fun premium_rate_bps<T>(pool: &DepegCoverPool<T>, cover: u64): u64 {
        let value = balance::value(&pool.funds);
        let util_bps: u128 = if (value == 0) {
            BPS // no capacity to sell against → price at the curve's ceiling
        } else {
            let u = (((pool.total_cover + cover) as u128) * BPS) / (value as u128);
            if (u > BPS) { BPS } else { u }
        };
        let surge_add = ((pool.surge_premium_bps as u128) * util_bps) / BPS;
        pool.premium_bps + (surge_add as u64)
    }

    /// Pool-priced premium for `cover` units at the current utilization rate.
    public fun premium_for<T>(pool: &DepegCoverPool<T>, cover: u64): u64 {
        let rate_bps = premium_rate_bps(pool, cover);
        (((cover as u128) * (rate_bps as u128)) / BPS) as u64
    }

    /// Buy depeg cover. `premium` must cover the pool-priced premium; any excess
    /// stays in the pool (accrues to LPs). The pool must remain fully collateralized
    /// after taking on the new liability.
    public fun buy_cover<T>(
        pool: &mut DepegCoverPool<T>,
        premium: Coin<T>,
        cover: u64,
        expiry_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Policy<T> {
        assert!(cover > 0, EZeroAmount);
        assert!(expiry_ms > clock::timestamp_ms(clock), EPolicyExpired);
        let activation_ms = clock::timestamp_ms(clock) + pool.activation_delay_secs * 1000;
        // A policy must outlive its activation delay, or it could never pay out.
        assert!(expiry_ms > activation_ms, EExpiryBeforeActivation);
        // Exposure caps (0 = uncapped) bound concentrated correlated risk.
        assert!(pool.max_cover_per_policy == 0 || cover <= pool.max_cover_per_policy, EPolicyCoverCap);
        assert!(
            pool.max_total_cover == 0 || pool.total_cover + cover <= pool.max_total_cover,
            EPoolCoverCap,
        );
        let required = premium_for(pool, cover);
        assert!(required > 0, EZeroPremium);
        let paid = coin::value(&premium);
        assert!(paid >= required, EInsufficientPremium);
        balance::join(&mut pool.funds, coin::into_balance(premium));
        assert!(balance::value(&pool.funds) >= pool.total_cover + cover, EInsolvent);
        pool.total_cover = pool.total_cover + cover;
        event::emit(CoverBought {
            pool: object::id(pool),
            cover,
            premium: paid,
            expiry_ms,
        });
        Policy {
            id: object::new(ctx),
            pool_id: object::id(pool),
            cover,
            premium_paid: paid,
            expiry_ms,
            activation_ms,
            armed: false,
            first_breach_ms: 0,
            breached: false,
            breach_price: 0,
        }
    }

    /// Read + verify the pool's Pyth feed: matches the insured feed id, is fresh,
    /// is at the expected exponent, and is non-negative. Returns the price magnitude.
    fun read_price_magnitude<T>(
        pool: &DepegCoverPool<T>,
        price_info_object: &PriceInfoObject,
        clock: &Clock,
    ): (u64, u64) {
        // 1. The object must carry the feed this pool insures.
        let info = price_info::get_price_info_from_price_info_object(price_info_object);
        let id = price_info::get_price_identifier(&info);
        assert!(price_identifier::get_bytes(&id) == pool.feed_id, EWrongFeed);

        // 2. Read with a freshness bound (aborts on a stale price).
        let p = pyth::get_price_no_older_than(price_info_object, clock, pool.max_age_secs);

        // 3. Price magnitude (USD feeds are positive; guard anyway).
        let price_i64 = price::get_price(&p);
        assert!(!i64::get_is_negative(&price_i64), ENegativePrice);
        let magnitude = i64::get_magnitude_if_positive(&price_i64);

        // 4. Exponent must match the pool's scale so the threshold compare is exact.
        let expo_i64 = price::get_expo(&p);
        let expo_neg = i64::get_is_negative(&expo_i64);
        let expo_mag = if (expo_neg) {
            i64::get_magnitude_if_negative(&expo_i64)
        } else {
            i64::get_magnitude_if_positive(&expo_i64)
        };
        assert!(expo_neg == pool.expo_neg && expo_mag == pool.expo_mag, EBadExpo);

        // 5. Reject an untrustworthy read: Pyth's `conf` is ~1 std-dev; if the
        // confidence/price ratio exceeds max_conf_bps we refuse to settle on it.
        let conf = price::get_conf(&p);
        assert!(
            (conf as u128) * 10_000 <= (magnitude as u128) * (pool.max_conf_bps as u128),
            EConfTooWide,
        );

        (magnitude, conf)
    }

    /// Pay out a latched policy: burn it, release its liability, and take its cover
    /// from the pool. The caller is responsible for the latch check.
    fun settle<T>(
        pool: &mut DepegCoverPool<T>,
        policy: Policy<T>,
        ctx: &mut TxContext,
    ): Coin<T> {
        let Policy {
            id, pool_id, cover, premium_paid: _, expiry_ms: _, activation_ms: _,
            armed: _, first_breach_ms: _, breached: _, breach_price,
        } = policy;
        assert!(pool_id == object::id(pool), EWrongPool);
        object::delete(id);
        pool.total_cover = pool.total_cover - cover;
        event::emit(Claimed { pool: object::id(pool), cover, price: breach_price });
        coin::take(&mut pool.funds, cover, ctx)
    }

    /// Free the liability of an expired, untriggered policy (LP capital releases).
    /// Callable by the policy holder once expiry has passed.
    public fun expire_policy<T>(pool: &mut DepegCoverPool<T>, policy: Policy<T>, clock: &Clock) {
        let Policy {
            id, pool_id, cover, premium_paid: _, expiry_ms, activation_ms: _,
            armed: _, first_breach_ms: _, breached, breach_price: _,
        } = policy;
        assert!(pool_id == object::id(pool), EWrongPool);
        assert!(clock::timestamp_ms(clock) > expiry_ms, ENotExpired);
        assert!(!breached, EBreachedCannotExpire);
        object::delete(id);
        pool.total_cover = pool.total_cover - cover;
    }

    // --- Dwell-based breach latch ---
    // Settlement decouples *detecting* a sustained breach from *collecting* the
    // payout. A keeper calls `record_breach` while the feed is below the floor: the
    // first sub-threshold read arms the policy, and a confirming read at least
    // `min_dwell_secs` later latches it. The holder then `claim_latched`s the payout
    // — even after the price recovers or the policy expires. Two reads a dwell apart
    // require a sustained depeg, so a transient wick or one manipulated update cannot
    // force a payout.

    /// Record a sub-threshold observation on this policy, reading Pyth on-chain. Arms
    /// the dwell on the first call and latches the policy on a confirming call at
    /// least `min_dwell_secs` later. Aborts unless the feed is at/below the pool floor
    /// (adverse-bounded) and the policy is unexpired; a confirming call inside the
    /// dwell window is a no-op (the keeper retries once the window elapses).
    public fun record_breach<T>(
        pool: &DepegCoverPool<T>,
        policy: &mut Policy<T>,
        price_info_object: &PriceInfoObject,
        clock: &Clock,
    ) {
        let (price_mag, conf) = read_price_magnitude(pool, price_info_object, clock);
        do_latch(pool, policy, price_mag, conf, clock);
    }

    fun do_latch<T>(
        pool: &DepegCoverPool<T>,
        policy: &mut Policy<T>,
        price_mag: u64,
        conf: u64,
        clock: &Clock,
    ) {
        assert!(policy.pool_id == object::id(pool), EWrongPool);
        // Already latched — nothing to do (don't re-assert price/expiry on a policy
        // that is already claimable).
        if (policy.breached) return;
        let now = clock::timestamp_ms(clock);
        assert!(now <= policy.expiry_ms, EPolicyExpired);
        // Activation delay: no breach counts until the policy has been active a while,
        // so cover bought at the instant of a depeg cannot pay out.
        assert!(now >= policy.activation_ms, ENotActive);
        // Adverse-bound: the upper edge of the confidence band must clear the floor,
        // for BOTH the arming and the confirming read.
        assert!(price_mag + conf <= pool.threshold, ENotDepegged);
        if (!policy.armed) {
            // Arm: start the dwell window on the first sub-threshold observation.
            policy.armed = true;
            policy.first_breach_ms = now;
            policy.breach_price = price_mag;
            event::emit(BreachArmed { pool: object::id(pool), price: price_mag, at_ms: now });
        } else if (now >= policy.first_breach_ms + pool.min_dwell_secs * 1000) {
            // Confirm: a second sub-threshold read a full dwell later latches it.
            policy.breach_price = price_mag;
            policy.breached = true;
            event::emit(BreachConfirmed { pool: object::id(pool), price: price_mag });
        };
        // else: armed but still inside the dwell window — no-op, retry later.
    }

    /// Claim a latched policy — pays even after the price recovered or the policy
    /// expired, because the sustained breach was recorded during coverage. No Pyth
    /// read needed.
    public fun claim_latched<T>(
        pool: &mut DepegCoverPool<T>,
        policy: Policy<T>,
        ctx: &mut TxContext,
    ): Coin<T> {
        assert!(policy.breached, ENotBreached);
        settle(pool, policy, ctx)
    }

    // --- Views ---

    public fun pool_value<T>(pool: &DepegCoverPool<T>): u64 { balance::value(&pool.funds) }
    public fun total_shares<T>(pool: &DepegCoverPool<T>): u64 { pool.total_shares }
    public fun total_cover<T>(pool: &DepegCoverPool<T>): u64 { pool.total_cover }
    public fun feed_id<T>(pool: &DepegCoverPool<T>): vector<u8> { pool.feed_id }
    public fun threshold<T>(pool: &DepegCoverPool<T>): u64 { pool.threshold }
    public fun premium_bps<T>(pool: &DepegCoverPool<T>): u64 { pool.premium_bps }
    public fun surge_premium_bps<T>(pool: &DepegCoverPool<T>): u64 { pool.surge_premium_bps }
    public fun max_conf_bps<T>(pool: &DepegCoverPool<T>): u64 { pool.max_conf_bps }
    public fun max_age_secs<T>(pool: &DepegCoverPool<T>): u64 { pool.max_age_secs }
    public fun min_dwell_secs<T>(pool: &DepegCoverPool<T>): u64 { pool.min_dwell_secs }
    public fun activation_delay_secs<T>(pool: &DepegCoverPool<T>): u64 { pool.activation_delay_secs }
    public fun max_cover_per_policy<T>(pool: &DepegCoverPool<T>): u64 { pool.max_cover_per_policy }
    public fun max_total_cover<T>(pool: &DepegCoverPool<T>): u64 { pool.max_total_cover }

    public fun shares<T>(s: &LpShare<T>): u64 { s.shares }
    public fun policy_cover<T>(p: &Policy<T>): u64 { p.cover }
    public fun policy_expiry_ms<T>(p: &Policy<T>): u64 { p.expiry_ms }
    public fun policy_breached<T>(p: &Policy<T>): bool { p.breached }
    public fun policy_armed<T>(p: &Policy<T>): bool { p.armed }
    public fun policy_first_breach_ms<T>(p: &Policy<T>): u64 { p.first_breach_ms }
    public fun policy_activation_ms<T>(p: &Policy<T>): u64 { p.activation_ms }

    #[test_only]
    public fun new_pool_for_testing<T>(
        feed_id: vector<u8>,
        expo_neg: bool,
        expo_mag: u64,
        threshold: u64,
        max_age_secs: u64,
        premium_bps: u64,
        surge_premium_bps: u64,
        max_conf_bps: u64,
        min_dwell_secs: u64,
        activation_delay_secs: u64,
        max_cover_per_policy: u64,
        max_total_cover: u64,
        ctx: &mut TxContext,
    ): DepegCoverPool<T> {
        new_pool<T>(
            feed_id, expo_neg, expo_mag, threshold, max_age_secs, premium_bps,
            surge_premium_bps, max_conf_bps, min_dwell_secs, activation_delay_secs,
            max_cover_per_policy, max_total_cover, ctx,
        )
    }

    #[test_only]
    /// Drive the dwell latch at a given price magnitude (no Pyth object), so the
    /// arm/confirm + capital logic is unit-testable without a live PriceInfoObject.
    public fun latch_at_price_for_testing<T>(
        pool: &DepegCoverPool<T>,
        policy: &mut Policy<T>,
        price_mag: u64,
        conf: u64,
        clock: &Clock,
    ) {
        do_latch(pool, policy, price_mag, conf, clock);
    }
}
