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
/// v1 settlement is "claim while breached": a claim succeeds if, at the moment it is
/// submitted (with a fresh Pyth update in the same PTB), the feed is at/below the
/// threshold. Latching a breach for later claim is a future enhancement.
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
        /// Flat premium rate: premium = cover * premium_bps / 10_000.
        premium_bps: u64,
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
        /// Set by `record_breach` when the feed breaches during coverage, so the
        /// holder can claim later even after the price recovers or the policy expires.
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

    public struct BreachRecorded has copy, drop {
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
        ctx: &mut TxContext,
    ) {
        let pool = new_pool<T>(
            feed_id, expo_neg, expo_mag, threshold, max_age_secs, premium_bps, ctx,
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

    /// Pool-priced premium for `cover` units: cover * premium_bps / 10_000.
    public fun premium_for<T>(pool: &DepegCoverPool<T>, cover: u64): u64 {
        (((cover as u128) * (pool.premium_bps as u128)) / BPS) as u64
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
            breached: false,
            breach_price: 0,
        }
    }

    /// Claim a policy's payout — TRUSTLESS: reads the pool's Pyth feed on-chain.
    /// Succeeds only if, before expiry, the fresh feed price is at/below the
    /// pool's depeg threshold. The `price_info_object` must be the pool's insured
    /// feed and must have been updated (in a prior PTB call) within `max_age_secs`.
    public fun claim<T>(
        pool: &mut DepegCoverPool<T>,
        price_info_object: &PriceInfoObject,
        policy: Policy<T>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<T> {
        let price_mag = read_price_magnitude(pool, price_info_object, clock);
        check_and_settle(pool, price_mag, policy, clock, ctx)
    }

    /// Read + verify the pool's Pyth feed: matches the insured feed id, is fresh,
    /// is at the expected exponent, and is non-negative. Returns the price magnitude.
    fun read_price_magnitude<T>(
        pool: &DepegCoverPool<T>,
        price_info_object: &PriceInfoObject,
        clock: &Clock,
    ): u64 {
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

        magnitude
    }

    /// Settlement core: a policy pays iff it is unexpired and `price_mag` is at/below
    /// the pool threshold. Shared by `claim` and tests.
    fun check_and_settle<T>(
        pool: &mut DepegCoverPool<T>,
        price_mag: u64,
        policy: Policy<T>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<T> {
        assert!(clock::timestamp_ms(clock) <= policy.expiry_ms, EPolicyExpired);
        assert!(price_mag <= pool.threshold, ENotDepegged);
        let Policy { id, pool_id, cover, premium_paid: _, expiry_ms: _, breached: _, breach_price: _ } = policy;
        assert!(pool_id == object::id(pool), EWrongPool);
        object::delete(id);
        pool.total_cover = pool.total_cover - cover;
        event::emit(Claimed { pool: object::id(pool), cover, price: price_mag });
        coin::take(&mut pool.funds, cover, ctx)
    }

    /// Free the liability of an expired, untriggered policy (LP capital releases).
    /// Callable by the policy holder once expiry has passed.
    public fun expire_policy<T>(pool: &mut DepegCoverPool<T>, policy: Policy<T>, clock: &Clock) {
        let Policy { id, pool_id, cover, premium_paid: _, expiry_ms, breached, breach_price: _ } = policy;
        assert!(pool_id == object::id(pool), EWrongPool);
        assert!(clock::timestamp_ms(clock) > expiry_ms, ENotExpired);
        assert!(!breached, EBreachedCannotExpire);
        object::delete(id);
        pool.total_cover = pool.total_cover - cover;
    }

    // --- Breach latch ---
    // v1 settlement is "claim while breached" — the holder must claim during the dip.
    // The latch decouples *detecting* the breach from *collecting* the payout: a
    // keeper records the breach while the feed is below the floor, and the holder
    // claims later — even after the price recovers or the policy expires.

    /// Record that the pool's feed breached the threshold during this policy's
    /// coverage. Reads Pyth on-chain (must be below the floor now, and unexpired).
    public fun record_breach<T>(
        pool: &DepegCoverPool<T>,
        policy: &mut Policy<T>,
        price_info_object: &PriceInfoObject,
        clock: &Clock,
    ) {
        let price_mag = read_price_magnitude(pool, price_info_object, clock);
        do_latch(pool, policy, price_mag, clock);
    }

    fun do_latch<T>(
        pool: &DepegCoverPool<T>,
        policy: &mut Policy<T>,
        price_mag: u64,
        clock: &Clock,
    ) {
        assert!(policy.pool_id == object::id(pool), EWrongPool);
        assert!(clock::timestamp_ms(clock) <= policy.expiry_ms, EPolicyExpired);
        assert!(price_mag <= pool.threshold, ENotDepegged);
        policy.breach_price = price_mag;
        policy.breached = true;
        event::emit(BreachRecorded { pool: object::id(pool), price: price_mag });
    }

    /// Claim a latched policy — pays even after the price recovered or the policy
    /// expired, because the breach was recorded during coverage. No Pyth read needed.
    public fun claim_latched<T>(
        pool: &mut DepegCoverPool<T>,
        policy: Policy<T>,
        ctx: &mut TxContext,
    ): Coin<T> {
        let Policy { id, pool_id, cover, premium_paid: _, expiry_ms: _, breached, breach_price } = policy;
        assert!(pool_id == object::id(pool), EWrongPool);
        assert!(breached, ENotBreached);
        object::delete(id);
        pool.total_cover = pool.total_cover - cover;
        event::emit(Claimed { pool: object::id(pool), cover, price: breach_price });
        coin::take(&mut pool.funds, cover, ctx)
    }

    // --- Views ---

    public fun pool_value<T>(pool: &DepegCoverPool<T>): u64 { balance::value(&pool.funds) }
    public fun total_shares<T>(pool: &DepegCoverPool<T>): u64 { pool.total_shares }
    public fun total_cover<T>(pool: &DepegCoverPool<T>): u64 { pool.total_cover }
    public fun feed_id<T>(pool: &DepegCoverPool<T>): vector<u8> { pool.feed_id }
    public fun threshold<T>(pool: &DepegCoverPool<T>): u64 { pool.threshold }
    public fun premium_bps<T>(pool: &DepegCoverPool<T>): u64 { pool.premium_bps }
    public fun max_age_secs<T>(pool: &DepegCoverPool<T>): u64 { pool.max_age_secs }

    public fun shares<T>(s: &LpShare<T>): u64 { s.shares }
    public fun policy_cover<T>(p: &Policy<T>): u64 { p.cover }
    public fun policy_expiry_ms<T>(p: &Policy<T>): u64 { p.expiry_ms }
    public fun policy_breached<T>(p: &Policy<T>): bool { p.breached }

    #[test_only]
    public fun new_pool_for_testing<T>(
        feed_id: vector<u8>,
        expo_neg: bool,
        expo_mag: u64,
        threshold: u64,
        max_age_secs: u64,
        premium_bps: u64,
        ctx: &mut TxContext,
    ): DepegCoverPool<T> {
        new_pool<T>(feed_id, expo_neg, expo_mag, threshold, max_age_secs, premium_bps, ctx)
    }

    #[test_only]
    /// Exercise settlement with a given price magnitude (no Pyth object), so the
    /// capital + trigger logic is unit-testable without a live PriceInfoObject.
    public fun claim_at_price_for_testing<T>(
        pool: &mut DepegCoverPool<T>,
        price_mag: u64,
        policy: Policy<T>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<T> {
        check_and_settle(pool, price_mag, policy, clock, ctx)
    }

    #[test_only]
    /// Latch a breach at a given price magnitude (no Pyth object) for tests.
    public fun latch_at_price_for_testing<T>(
        pool: &DepegCoverPool<T>,
        policy: &mut Policy<T>,
        price_mag: u64,
        clock: &Clock,
    ) {
        do_latch(pool, policy, price_mag, clock);
    }
}
