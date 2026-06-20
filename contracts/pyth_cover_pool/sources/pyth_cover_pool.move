/// Backstop DepegCoverPool — a mainnet, fully-collateralized parametric cover
/// pool that settles TRUSTLESSLY against a Pyth Network price feed.
///
/// A pool insures one asset (one Pyth feed id) against breaking below a `threshold`
/// price — e.g. a stablecoin depeg ("pay if suiUSDe < $0.985"). LPs supply capital
/// and earn premiums; protocol adapters with a pool BuyerCap buy position-bound
/// cover; and when Pyth's adverse price band stays at or below the threshold, the
/// protected reserve claims a payout straight from the pool.
///
/// The settlement read uses `pyth::pyth::get_price_no_older_than`, which aborts on a
/// stale price by construction — so there is no Backstop-controlled value, and no
/// stale-oracle, in the payout path. Premium *pricing* is set off-chain by whoever
/// seeds the pool (the `premium_bps` rate); settlement is the only thing that must
/// be objective, and it is. Pricing-subjective / settlement-objective is the whole
/// design: nobody has to trust Backstop to get paid.
///
/// The pool is always fully collateralized: `value(funds) >= total_cover`.
/// Formal-prover target: encode that invariant once the Sui prover is available
/// for this toolchain. See `contracts/pyth_cover_pool/PROVER.md`.
///
/// Settlement requires a bounded dwell, never a single read — there is no native
/// on-chain TWAP on Sui, so the pool epoch observes the feed at/below the threshold
/// twice, at least `min_dwell_secs` apart, using fresh, conf-banded, feed-matched
/// Pyth reads. A healthy supplied observation resets an open epoch, and an old arm
/// expires instead of confirming against an unrelated later dip. `record_breach`
/// remains as a policy-holder compatibility path, but it routes through the pool
/// epoch rules instead of maintaining an independent policy-level event machine.
module pyth_cover_pool::pyth_cover_pool {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::table::{Self, Table};
    use pyth::pyth;
    use pyth::price;
    use pyth::price_info::{Self, PriceInfoObject};
    use pyth::price_identifier;
    use pyth::i64;

    /// Basis-points denominator.
    const BPS: u128 = 10_000;
    /// `premium_bps` and `surge_premium_bps` quote one 30-day cover period.
    const PREMIUM_PERIOD_SECS: u64 = 2_592_000;
    /// Sales close before the claim threshold: a fresh healthy read must have its
    /// lower confidence edge above threshold plus this buffer.
    const SALE_CUTOFF_BUFFER_BPS: u64 = 50;
    /// A pool arm must confirm within this multiple of the dwell window after the
    /// minimum dwell has elapsed; later adverse reads start a new arm.
    const CONFIRMATION_GRACE_MULTIPLIER: u64 = 3;
    /// Production floor on `min_dwell_secs`: a sustained breach must be observed over
    /// at least this window, so a single manipulated Pyth tick can never settle.
    const MIN_DWELL_FLOOR_SECS: u64 = 300;
    /// Production floor on `activation_delay_secs`: cover cannot become claimable until
    /// at least this long after purchase, closing last-tick adverse selection.
    const MIN_ACTIVATION_DELAY_SECS: u64 = 300;
    /// After a confirmed breach, a claimable policy that is never spent can be reaped by
    /// anyone once this window passes, releasing the LP capital it would otherwise lock.
    const CLAIM_GRACE_SECS: u64 = 1_209_600; // 14 days

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
    /// Pool is paused — new deposits and cover purchases are halted (claims are not).
    const EPaused: u64 = 18;
    /// AdminCap does not govern this pool.
    const EWrongAdminCap: u64 = 19;
    /// Proposed parameter kind is not recognised.
    const EBadParamKind: u64 = 20;
    /// No pending parameter update to execute or cancel.
    const ENoPendingUpdate: u64 = 21;
    /// The governance timelock on the pending update has not elapsed yet.
    const ETimelockNotElapsed: u64 = 22;
    /// Requested policy term exceeds the pool's maximum term.
    const EPolicyDurationTooLong: u64 = 23;
    /// Proposed parameter value is outside its safety bounds.
    const EBadParamValue: u64 = 24;
    /// Pool-side policy state was already swept or never existed.
    const EPolicyNotActive: u64 = 25;
    const EPoolEpochOpen: u64 = 26;
    const EStillDepegged: u64 = 27;
    const ESaleClosed: u64 = 28;
    const EZeroShares: u64 = 29;
    /// Deposit into a fully-drained pool that still has shares outstanding — the
    /// share price is undefined, so the deposit is blocked rather than diluted.
    const EPoolDrained: u64 = 30;
    const EOutstandingCover: u64 = 31;
    /// A claimable policy cannot be reaped until its post-confirmation claim window passes.
    const EClaimWindowOpen: u64 = 34;
    const EDirectSalesDisabled: u64 = 32;
    const EWrongBuyerCap: u64 = 33;

    // Parameter kinds for timelocked updates.
    const K_THRESHOLD: u8 = 0;
    const K_PREMIUM_BPS: u8 = 1;
    const K_SURGE_PREMIUM_BPS: u8 = 2;
    const K_MAX_AGE_SECS: u8 = 3;
    const K_MAX_CONF_BPS: u8 = 4;
    const K_MIN_DWELL_SECS: u8 = 5;
    const K_ACTIVATION_DELAY_SECS: u8 = 6;
    const K_MAX_COVER_PER_POLICY: u8 = 7;
    const K_MAX_TOTAL_COVER: u8 = 8;
    const K_TREASURY_FEE_BPS: u8 = 9;
    const K_KEEPER_BOUNTY: u8 = 10;
    const K_MAX_POLICY_DURATION_SECS: u8 = 11;

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
        /// expressed at the pool's expected exponent (e.g. $0.985 @ expo -8 = 98_500_000).
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
        /// Maximum cover term in seconds. Prevents long-dated policies from locking
        /// underwriting capacity indefinitely.
        max_policy_duration_secs: u64,
        /// Max cover a single policy may buy (0 = no per-policy limit). Caps the blow-up
        /// from one whale concentrating the pool's correlated risk in one position.
        max_cover_per_policy: u64,
        /// Max aggregate `total_cover` the pool will underwrite (0 = bounded only by
        /// full collateralization). A hard ceiling on the pool's correlated exposure.
        max_total_cover: u64,
        /// Protocol fee skimmed from each paid premium into `treasury`, in bps.
        treasury_fee_bps: u64,
        /// Fixed treasury-funded reward paid to the keeper that confirms a breach.
        keeper_bounty: u64,
        /// When true, `deposit_lp` and cover purchases are halted (a guardian
        /// emergency lever). The claim / settlement path is pause-EXEMPT.
        paused: bool,
        /// When false, public wallet buys are disabled; only a protocol adapter
        /// holding a BuyerCap for this pool can buy cover.
        direct_sales_enabled: bool,
        /// Governance delay (seconds) a proposed parameter update must wait before it
        /// can be executed — no silent live changes under LPs/holders.
        timelock_secs: u64,
        /// The single in-flight timelocked parameter update, if any.
        pending: Option<PendingParamUpdate>,
        /// Pooled capital: LP deposits + collected premiums.
        funds: Balance<T>,
        /// Protocol-owned premium fees. Never backs policy liabilities.
        treasury: Balance<T>,
        /// Total LP shares outstanding.
        total_shares: u64,
        /// Sum of cover on active policies — the pool's outstanding liability.
        total_cover: u64,
        epoch_id: u64,
        epoch_armed: bool,
        epoch_first_breach_ms: u64,
        epoch_breached: bool,
        epoch_confirmed_ms: u64,
        epoch_breach_price: u64,
        epochs: Table<u64, EpochState>,
        /// Pool-side active policy state. This lets any keeper release expired,
        /// unbreached liabilities even if the holder never spends their Policy object.
        policies: Table<ID, PolicyState>,
    }

    /// Governs one pool: pause toggle + timelocked parameter updates. Minted to the
    /// pool creator at `create_and_share`. Not phantom-typed — it carries `pool_id`.
    public struct AdminCap has key, store {
        id: UID,
        pool_id: ID,
    }

    /// Capability for a protocol adapter to buy cover into its own position object.
    /// Store this inside a shared adapter/market object instead of transferring it
    /// to end users.
    public struct BuyerCap<phantom T> has key, store {
        id: UID,
        pool_id: ID,
    }

    /// A proposed parameter change waiting out the pool's governance timelock.
    public struct PendingParamUpdate has copy, drop, store {
        kind: u8,
        value: u64,
        eta_ms: u64,
    }

    public struct EpochState has copy, drop, store {
        first_breach_ms: u64,
        confirmed_ms: u64,
        price: u64,
    }

    public struct PolicyState has drop, store {
        cover: u64,
        expiry_ms: u64,
        activation_ms: u64,
        epoch_id: u64,
        breached: bool,
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
        /// Pool-level epoch the policy was bought into.
        epoch_id: u64,
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
        duration_secs: u64,
    }

    public struct PausedSet has copy, drop {
        pool: ID,
        paused: bool,
    }

    public struct DirectSalesSet has copy, drop {
        pool: ID,
        enabled: bool,
    }

    public struct ParamUpdateProposed has copy, drop {
        pool: ID,
        kind: u8,
        value: u64,
        eta_ms: u64,
    }

    public struct ParamUpdateExecuted has copy, drop {
        pool: ID,
        kind: u8,
        value: u64,
    }

    public struct ParamUpdateCancelled has copy, drop {
        pool: ID,
        kind: u8,
    }

    public struct Claimed has copy, drop {
        pool: ID,
        cover: u64,
        price: u64,
    }

    public struct PolicyExpired has copy, drop {
        pool: ID,
        policy: ID,
        cover: u64,
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

    public struct PoolBreachArmed has copy, drop {
        pool: ID,
        epoch_id: u64,
        price: u64,
        at_ms: u64,
    }

    public struct PoolBreachConfirmed has copy, drop {
        pool: ID,
        epoch_id: u64,
        price: u64,
        at_ms: u64,
    }

    public struct PoolEpochRecovered has copy, drop {
        pool: ID,
        epoch_id: u64,
        next_epoch_id: u64,
        price: u64,
        at_ms: u64,
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
        max_policy_duration_secs: u64,
        max_cover_per_policy: u64,
        max_total_cover: u64,
        timelock_secs: u64,
        treasury_fee_bps: u64,
        keeper_bounty: u64,
        ctx: &mut TxContext,
    ): DepegCoverPool<T> {
        // Production pools must clear the safety floors; the test-only constructor
        // (`new_pool_for_testing`) bypasses these so units can drive short windows.
        assert!(min_dwell_secs >= MIN_DWELL_FLOOR_SECS, EBadParamValue);
        assert!(activation_delay_secs >= MIN_ACTIVATION_DELAY_SECS, EBadParamValue);
        build_pool<T>(
            feed_id, expo_neg, expo_mag, threshold, max_age_secs, premium_bps,
            surge_premium_bps, max_conf_bps, min_dwell_secs, activation_delay_secs,
            max_policy_duration_secs, max_cover_per_policy, max_total_cover, timelock_secs,
            treasury_fee_bps, keeper_bounty, ctx,
        )
    }

    fun build_pool<T>(
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
        max_policy_duration_secs: u64,
        max_cover_per_policy: u64,
        max_total_cover: u64,
        timelock_secs: u64,
        treasury_fee_bps: u64,
        keeper_bounty: u64,
        ctx: &mut TxContext,
    ): DepegCoverPool<T> {
        assert_valid_pool_params(
            threshold, max_age_secs, premium_bps, surge_premium_bps, max_conf_bps,
            min_dwell_secs, activation_delay_secs, max_policy_duration_secs,
            timelock_secs, treasury_fee_bps,
        );
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
            max_policy_duration_secs,
            max_cover_per_policy,
            max_total_cover,
            treasury_fee_bps,
            keeper_bounty,
            paused: false,
            direct_sales_enabled: false,
            timelock_secs,
            pending: option::none(),
            funds: balance::zero<T>(),
            treasury: balance::zero<T>(),
            total_shares: 0,
            total_cover: 0,
            epoch_id: 0,
            epoch_armed: false,
            epoch_first_breach_ms: 0,
            epoch_breached: false,
            epoch_confirmed_ms: 0,
            epoch_breach_price: 0,
            epochs: table::new<u64, EpochState>(ctx),
            policies: table::new<ID, PolicyState>(ctx),
        }
    }

    /// Create and share a depeg-cover pool insuring `feed_id` below `threshold`.
    /// The creator receives the `AdminCap` plus a `BuyerCap` to install into a
    /// protocol adapter. Direct wallet sales are disabled by default.
    #[allow(lint(self_transfer))]
    public fun create_and_share<T>(
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
        max_policy_duration_secs: u64,
        max_cover_per_policy: u64,
        max_total_cover: u64,
        timelock_secs: u64,
        treasury_fee_bps: u64,
        keeper_bounty: u64,
        ctx: &mut TxContext,
    ) {
        let pool = new_pool<T>(
            feed_id, expo_neg, expo_mag, threshold, max_age_secs, premium_bps,
            surge_premium_bps, max_conf_bps, min_dwell_secs, activation_delay_secs,
            max_policy_duration_secs, max_cover_per_policy, max_total_cover, timelock_secs,
            treasury_fee_bps, keeper_bounty, ctx,
        );
        let pool_id = object::id(&pool);
        event::emit(PoolCreated {
            pool: pool_id,
            feed_id: pool.feed_id,
            threshold,
            premium_bps,
        });
        transfer::transfer(AdminCap { id: object::new(ctx), pool_id }, ctx.sender());
        transfer::transfer(BuyerCap<T> { id: object::new(ctx), pool_id }, ctx.sender());
        transfer::share_object(pool);
    }

    /// Mint another adapter buyer capability for this pool. Use when onboarding
    /// a protocol integration; do not transfer this cap to retail users.
    public fun issue_buyer_cap<T>(
        pool: &DepegCoverPool<T>,
        cap: &AdminCap,
        ctx: &mut TxContext,
    ): BuyerCap<T> {
        assert_admin(pool, cap);
        BuyerCap<T> { id: object::new(ctx), pool_id: object::id(pool) }
    }

    // --- Liquidity provision ---

    /// Supply capital and receive LP shares, minted pro-rata to the pool's value
    /// before this deposit (the first deposit anchors 1 share = 1 unit).
    public fun deposit_lp<T>(
        pool: &mut DepegCoverPool<T>,
        coin: Coin<T>,
        ctx: &mut TxContext,
    ): LpShare<T> {
        assert!(!pool.paused, EPaused);
        assert!(!pool.epoch_armed && !pool.epoch_breached, EPoolEpochOpen);
        let amount = coin::value(&coin);
        assert!(amount > 0, EZeroAmount);
        let value_before = balance::value(&pool.funds);
        // Anchor 1 share = 1 unit ONLY on a genuinely fresh pool. If shares are
        // outstanding but the pool was fully drained to zero value (a total-loss
        // claim event), the share price is undefined — block the deposit so the
        // newcomer's capital is not silently diluted by the worthless zombie shares.
        // Those holders must redeem their (zero-value) shares first to reset the pool.
        let shares = if (pool.total_shares == 0) {
            amount
        } else {
            assert!(value_before > 0, EPoolDrained);
            (((amount as u128) * (pool.total_shares as u128)) / (value_before as u128)) as u64
        };
        assert!(shares > 0, EZeroShares);
        balance::join(&mut pool.funds, coin::into_balance(coin));
        pool.total_shares = pool.total_shares + shares;
        LpShare { id: object::new(ctx), pool_id: object::id(pool), shares }
    }

    fun assert_valid_pool_params(
        threshold: u64,
        max_age_secs: u64,
        premium_bps: u64,
        surge_premium_bps: u64,
        max_conf_bps: u64,
        min_dwell_secs: u64,
        activation_delay_secs: u64,
        max_policy_duration_secs: u64,
        timelock_secs: u64,
        treasury_fee_bps: u64,
    ) {
        assert!(threshold > 0, EBadParamValue);
        assert!(max_age_secs > 0 && max_age_secs <= 3_600, EBadParamValue);
        assert!(premium_bps > 0 && premium_bps <= (BPS as u64), EBadParamValue);
        assert!(surge_premium_bps <= (BPS as u64), EBadParamValue);
        assert!(max_conf_bps > 0 && max_conf_bps <= (BPS as u64), EBadParamValue);
        assert!(min_dwell_secs > 0 && min_dwell_secs <= max_policy_duration_secs, EBadParamValue);
        assert!(
            activation_delay_secs < max_policy_duration_secs,
            EBadParamValue,
        );
        assert!(
            max_policy_duration_secs > 0 && max_policy_duration_secs <= 7_776_000,
            EBadParamValue,
        );
        assert!(timelock_secs >= 3_600 && timelock_secs <= 2_592_000, EBadParamValue);
        assert!(treasury_fee_bps <= 2_000, EBadParamValue);
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
        // Freeze redemptions while a breach epoch is armed or confirmed: otherwise LPs
        // could race to pull the above-collateral buffer ahead of the pending claims,
        // leaving the slowest LPs to absorb the loss. Recovery reopens withdrawals.
        assert!(!pool.epoch_armed && !pool.epoch_breached, EPoolEpochOpen);
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
            let u = (((pool.total_cover as u128) + (cover as u128)) * BPS) / (value as u128);
            if (u > BPS) { BPS } else { u }
        };
        let surge_add = ((pool.surge_premium_bps as u128) * util_bps) / BPS;
        pool.premium_bps + (surge_add as u64)
    }

    fun premium_for_duration_unchecked<T>(
        pool: &DepegCoverPool<T>,
        cover: u64,
        duration_secs: u64,
    ): u64 {
        let rate_bps = premium_rate_bps(pool, cover);
        let denom = BPS * (PREMIUM_PERIOD_SECS as u128);
        let n = (cover as u128) * (rate_bps as u128) * (duration_secs as u128);
        ((n + denom - 1) / denom) as u64
    }

    /// One-period pool-priced premium for `cover` units at the current utilization
    /// rate. A period is 30 days; use `premium_for_duration` for exact term quotes.
    public fun premium_for<T>(pool: &DepegCoverPool<T>, cover: u64): u64 {
        premium_for_duration_unchecked(pool, cover, PREMIUM_PERIOD_SECS)
    }

    /// Pool-priced premium for a specific cover duration in seconds.
    public fun premium_for_duration<T>(
        pool: &DepegCoverPool<T>,
        cover: u64,
        duration_secs: u64,
    ): u64 {
        assert!(duration_secs > 0, EPolicyExpired);
        assert!(duration_secs <= pool.max_policy_duration_secs, EPolicyDurationTooLong);
        premium_for_duration_unchecked(pool, cover, duration_secs)
    }

    /// Legacy direct wallet purchase path. Production pools disable direct sales
    /// so cover has to be bought through a BuyerCap-holding protocol adapter.
    public fun buy_cover<T>(
        pool: &mut DepegCoverPool<T>,
        premium: Coin<T>,
        cover: u64,
        expiry_ms: u64,
        price_info_object: &PriceInfoObject,
        clock: &Clock,
        ctx: &mut TxContext,
    ): (Policy<T>, Coin<T>) {
        assert!(pool.direct_sales_enabled, EDirectSalesDisabled);
        let (price_mag, conf) = read_price_magnitude(pool, price_info_object, clock);
        buy_cover_checked(pool, premium, cover, expiry_ms, price_mag, conf, clock, ctx)
    }

    /// Buy depeg cover through a protocol adapter cap. `premium` must cover the
    /// pool-priced premium; any excess is returned to the caller instead of being
    /// donated into pool value. The protocol fee goes to treasury, and the
    /// remainder accrues to LPs. The pool must remain fully collateralized after
    /// taking on the new liability.
    public fun buy_cover_with_cap<T>(
        pool: &mut DepegCoverPool<T>,
        cap: &BuyerCap<T>,
        premium: Coin<T>,
        cover: u64,
        expiry_ms: u64,
        price_info_object: &PriceInfoObject,
        clock: &Clock,
        ctx: &mut TxContext,
    ): (Policy<T>, Coin<T>) {
        assert!(cap.pool_id == object::id(pool), EWrongBuyerCap);
        let (price_mag, conf) = read_price_magnitude(pool, price_info_object, clock);
        buy_cover_checked(pool, premium, cover, expiry_ms, price_mag, conf, clock, ctx)
    }

    fun buy_cover_checked<T>(
        pool: &mut DepegCoverPool<T>,
        premium: Coin<T>,
        cover: u64,
        expiry_ms: u64,
        price_mag: u64,
        conf: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): (Policy<T>, Coin<T>) {
        assert!(!pool.paused, EPaused);
        assert!(!pool.epoch_armed && !pool.epoch_breached, EPoolEpochOpen);
        assert!(cover > 0, EZeroAmount);
        let now = clock::timestamp_ms(clock);
        assert!(expiry_ms > now, EPolicyExpired);
        let duration_ms = expiry_ms - now;
        let duration_secs = (duration_ms + 999) / 1000;
        assert!(duration_secs <= pool.max_policy_duration_secs, EPolicyDurationTooLong);
        let activation_ms = now + pool.activation_delay_secs * 1000;
        // A policy must outlive its activation delay, or it could never pay out.
        assert!(expiry_ms > activation_ms, EExpiryBeforeActivation);
        // Exposure caps (0 = uncapped) bound concentrated correlated risk.
        assert!(pool.max_cover_per_policy == 0 || cover <= pool.max_cover_per_policy, EPolicyCoverCap);
        assert!(
            pool.max_total_cover == 0 ||
                (pool.total_cover as u128) + (cover as u128) <= (pool.max_total_cover as u128),
            EPoolCoverCap,
        );
        assert_sale_open(pool, price_mag, conf);
        let required = premium_for_duration(pool, cover, duration_secs);
        assert!(required > 0, EZeroPremium);
        let paid = coin::value(&premium);
        assert!(paid >= required, EInsufficientPremium);
        let mut premium_balance = coin::into_balance(premium);
        let refund = if (paid > required) {
            coin::take(&mut premium_balance, paid - required, ctx)
        } else {
            coin::zero<T>(ctx)
        };
        let fee = (((required as u128) * (pool.treasury_fee_bps as u128)) / BPS) as u64;
        if (fee > 0) {
            balance::join(&mut pool.treasury, balance::split(&mut premium_balance, fee));
        };
        balance::join(&mut pool.funds, premium_balance);
        assert!(
            (balance::value(&pool.funds) as u128) >= (pool.total_cover as u128) + (cover as u128),
            EInsolvent,
        );
        pool.total_cover = pool.total_cover + cover;
        let policy_uid = object::new(ctx);
        let policy_id = object::uid_to_inner(&policy_uid);
        table::add(&mut pool.policies, policy_id, PolicyState {
            cover,
            expiry_ms,
            activation_ms,
            epoch_id: pool.epoch_id,
            breached: false,
        });
        event::emit(CoverBought {
            pool: object::id(pool),
            cover,
            premium: required,
            expiry_ms,
            duration_secs,
        });
        let policy = Policy {
            id: policy_uid,
            pool_id: object::id(pool),
            cover,
            premium_paid: required,
            expiry_ms,
            activation_ms,
            epoch_id: pool.epoch_id,
            armed: false,
            first_breach_ms: 0,
            breached: false,
            breach_price: 0,
        };
        (policy, refund)
    }

    fun sale_cutoff<T>(pool: &DepegCoverPool<T>): u64 {
        ((((pool.threshold as u128) * ((BPS as u128) + (SALE_CUTOFF_BUFFER_BPS as u128))) +
            BPS - 1) / BPS) as u64
    }

    fun assert_sale_open<T>(pool: &DepegCoverPool<T>, price_mag: u64, conf: u64) {
        assert!(price_mag > conf, ESaleClosed);
        assert!(price_mag - conf > sale_cutoff(pool), ESaleClosed);
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

    fun is_adverse<T>(pool: &DepegCoverPool<T>, price_mag: u64, conf: u64): bool {
        ((price_mag as u128) + (conf as u128)) <= (pool.threshold as u128)
    }

    fun is_healthy<T>(pool: &DepegCoverPool<T>, price_mag: u64, conf: u64): bool {
        price_mag > conf && price_mag - conf > pool.threshold
    }

    fun confirmation_deadline_ms<T>(pool: &DepegCoverPool<T>): u64 {
        pool.epoch_first_breach_ms +
            pool.min_dwell_secs * 1000 * (CONFIRMATION_GRACE_MULTIPLIER + 1)
    }

    /// Pay out a latched policy: burn it, release its liability, and take its cover
    /// from the pool. The caller is responsible for the latch check.
    fun settle<T>(
        pool: &mut DepegCoverPool<T>,
        policy: Policy<T>,
        ctx: &mut TxContext,
    ): Coin<T> {
        assert!(policy.pool_id == object::id(pool), EWrongPool);
        let policy_id = object::id(&policy);
        let epoch_claimable = epoch_claims_policy(pool, &policy);
        assert!(table::contains(&pool.policies, policy_id), EPolicyNotActive);
        let state = table::remove(&mut pool.policies, policy_id);
        assert!(state.cover == policy.cover, EWrongPool);
        assert!(state.expiry_ms == policy.expiry_ms, EWrongPool);
        assert!(state.activation_ms == policy.activation_ms, EWrongPool);
        assert!(state.epoch_id == policy.epoch_id, EWrongPool);
        let directly_latched = state.breached || policy.breached;
        assert!(directly_latched || epoch_claimable, ENotBreached);
        let cover = policy.cover;
        let price = if (directly_latched) {
            policy.breach_price
        } else {
            table::borrow(&pool.epochs, policy.epoch_id).price
        };
        let Policy {
            id, pool_id: _, cover: _, premium_paid: _, expiry_ms: _, activation_ms: _,
            epoch_id: _, armed: _, first_breach_ms: _, breached: _, breach_price: _,
        } = policy;
        object::delete(id);
        pool.total_cover = pool.total_cover - cover;
        event::emit(Claimed { pool: object::id(pool), cover, price });
        coin::take(&mut pool.funds, cover, ctx)
    }

    fun epoch_claims_policy<T>(pool: &DepegCoverPool<T>, policy: &Policy<T>): bool {
        if (!table::contains(&pool.epochs, policy.epoch_id)) return false;
        let e = table::borrow(&pool.epochs, policy.epoch_id);
        policy.activation_ms <= e.first_breach_ms && policy.expiry_ms >= e.confirmed_ms
    }

    fun epoch_claims_state<T>(pool: &DepegCoverPool<T>, state: &PolicyState): bool {
        if (!table::contains(&pool.epochs, state.epoch_id)) return false;
        let e = table::borrow(&pool.epochs, state.epoch_id);
        state.activation_ms <= e.first_breach_ms && state.expiry_ms >= e.confirmed_ms
    }

    fun release_expired_policy<T>(
        pool: &mut DepegCoverPool<T>,
        policy_id: ID,
        clock: &Clock,
    ) {
        assert!(table::contains(&pool.policies, policy_id), EPolicyNotActive);
        let state = table::remove(&mut pool.policies, policy_id);
        assert!(clock::timestamp_ms(clock) > state.expiry_ms, ENotExpired);
        assert!(!state.breached && !epoch_claims_state(pool, &state), EBreachedCannotExpire);
        pool.total_cover = pool.total_cover - state.cover;
        event::emit(PolicyExpired { pool: object::id(pool), policy: policy_id, cover: state.cover });
    }

    /// Free the liability of an expired, untriggered policy (LP capital releases).
    /// Callable by anyone once expiry has passed; the holder's owned `Policy` object
    /// becomes a stale receipt and can be burned with `expire_policy`.
    public fun expire_policy_by_id<T>(
        pool: &mut DepegCoverPool<T>,
        policy_id: ID,
        clock: &Clock,
    ) {
        release_expired_policy(pool, policy_id, clock);
    }

    /// Burn an expired, untriggered Policy object. If no keeper swept it yet, this
    /// also releases the pool-side liability.
    public fun expire_policy<T>(pool: &mut DepegCoverPool<T>, policy: Policy<T>, clock: &Clock) {
        assert!(policy.pool_id == object::id(pool), EWrongPool);
        assert!(!policy.breached && !epoch_claims_policy(pool, &policy), EBreachedCannotExpire);
        let policy_id = object::id(&policy);
        let expiry_ms = policy.expiry_ms;
        let Policy {
            id, pool_id: _, cover: _, premium_paid: _, expiry_ms: _, activation_ms: _,
            epoch_id: _, armed: _, first_breach_ms: _, breached: _, breach_price: _,
        } = policy;
        if (table::contains(&pool.policies, policy_id)) {
            release_expired_policy(pool, policy_id, clock);
        } else {
            assert!(clock::timestamp_ms(clock) > expiry_ms, ENotExpired);
        };
        object::delete(id);
    }

    /// Reap a confirmed-breach policy that was never claimed. A latched policy is
    /// claimable forever, so an abandoned one (lost key, holder never claims) would
    /// otherwise lock its `cover` in `total_cover` indefinitely and freeze the LP
    /// capital backing it. Once `CLAIM_GRACE_SECS` has passed since the epoch
    /// confirmed, anyone may release that liability; the holder has forfeited the
    /// unclaimed payout. Callable only on a still-claimable, past-window policy.
    public fun reap_unclaimed_policy<T>(
        pool: &mut DepegCoverPool<T>,
        policy_id: ID,
        clock: &Clock,
    ) {
        assert!(table::contains(&pool.policies, policy_id), EPolicyNotActive);
        let state = table::borrow(&pool.policies, policy_id);
        assert!(state.breached || epoch_claims_state(pool, state), ENotBreached);
        let epoch_id = state.epoch_id;
        let confirmed_ms = table::borrow(&pool.epochs, epoch_id).confirmed_ms;
        assert!(
            clock::timestamp_ms(clock) > confirmed_ms + CLAIM_GRACE_SECS * 1000,
            EClaimWindowOpen,
        );
        let removed = table::remove(&mut pool.policies, policy_id);
        pool.total_cover = pool.total_cover - removed.cover;
        event::emit(PolicyExpired { pool: object::id(pool), policy: policy_id, cover: removed.cover });
    }

    // --- Dwell-based pool epoch latch ---
    // Settlement decouples detecting a bounded depeg epoch from collecting payout.
    // Keepers should call `record_pool_breach`: the first adverse read arms the pool
    // epoch, and a confirming read inside the allowed dwell window confirms it.
    // `record_breach` is retained for policy-holder compatibility but now routes
    // through the same pool epoch rules instead of creating an independent latch.

    /// Record a breach observation through a policy-holder path. This is a
    /// compatibility wrapper around the pool epoch state machine: it cannot make a
    /// policy claimable unless the confirmed pool epoch covers that policy.
    public fun record_breach<T>(
        pool: &mut DepegCoverPool<T>,
        policy: &mut Policy<T>,
        price_info_object: &PriceInfoObject,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let (price_mag, conf) = read_price_magnitude(pool, price_info_object, clock);
        do_latch(pool, policy, price_mag, conf, clock, ctx);
    }

    /// Record a pool-level sub-threshold observation. One sustained pool epoch makes
    /// every policy active before the epoch armed and unexpired at confirmation
    /// claimable, so keepers do not need to touch every policy during a mass depeg.
    public fun record_pool_breach<T>(
        pool: &mut DepegCoverPool<T>,
        price_info_object: &PriceInfoObject,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let (price_mag, conf) = read_price_magnitude(pool, price_info_object, clock);
        do_pool_latch(pool, price_mag, conf, clock, ctx);
    }

    /// Close an armed or confirmed pool epoch after a confidence-bounded recovery:
    /// the lower edge of the Pyth band must be above the floor. Confirmed epochs
    /// advance `epoch_id`, so future policies cannot claim against the old epoch.
    public fun record_pool_recovery<T>(
        pool: &mut DepegCoverPool<T>,
        price_info_object: &PriceInfoObject,
        clock: &Clock,
    ) {
        let (price_mag, conf) = read_price_magnitude(pool, price_info_object, clock);
        do_pool_recovery(pool, price_mag, conf, clock);
    }

    #[allow(lint(self_transfer))]
    fun pay_keeper_bounty<T>(pool: &mut DepegCoverPool<T>, ctx: &mut TxContext) {
        let bounty = pool.keeper_bounty;
        if (bounty > 0 && balance::value(&pool.treasury) >= bounty) {
            let keeper = ctx.sender();
            let payout = coin::take(&mut pool.treasury, bounty, ctx);
            transfer::public_transfer(payout, keeper);
        };
    }

    fun do_pool_latch<T>(
        pool: &mut DepegCoverPool<T>,
        price_mag: u64,
        conf: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        if (!is_adverse(pool, price_mag, conf)) {
            if ((pool.epoch_armed || pool.epoch_breached) && is_healthy(pool, price_mag, conf)) {
                do_pool_recovery(pool, price_mag, conf, clock);
                return
            };
            assert!(false, ENotDepegged);
        };
        if (pool.epoch_breached) return;
        if (!pool.epoch_armed) {
            pool.epoch_armed = true;
            pool.epoch_first_breach_ms = now;
            pool.epoch_breach_price = price_mag;
            event::emit(PoolBreachArmed {
                pool: object::id(pool),
                epoch_id: pool.epoch_id,
                price: price_mag,
                at_ms: now,
            });
        } else if (now > confirmation_deadline_ms(pool)) {
            pool.epoch_first_breach_ms = now;
            pool.epoch_breach_price = price_mag;
            event::emit(PoolBreachArmed {
                pool: object::id(pool),
                epoch_id: pool.epoch_id,
                price: price_mag,
                at_ms: now,
            });
        } else if (now >= pool.epoch_first_breach_ms + pool.min_dwell_secs * 1000) {
            pool.epoch_breached = true;
            pool.epoch_confirmed_ms = now;
            pool.epoch_breach_price = price_mag;
            if (!table::contains(&pool.epochs, pool.epoch_id)) {
                table::add(&mut pool.epochs, pool.epoch_id, EpochState {
                    first_breach_ms: pool.epoch_first_breach_ms,
                    confirmed_ms: now,
                    price: price_mag,
                });
            };
            pay_keeper_bounty(pool, ctx);
            event::emit(PoolBreachConfirmed {
                pool: object::id(pool),
                epoch_id: pool.epoch_id,
                price: price_mag,
                at_ms: now,
            });
        };
    }

    fun do_pool_recovery<T>(
        pool: &mut DepegCoverPool<T>,
        price_mag: u64,
        conf: u64,
        clock: &Clock,
    ) {
        assert!(price_mag > conf && price_mag - conf > pool.threshold, EStillDepegged);
        let closed_epoch = pool.epoch_id;
        if (pool.epoch_breached) {
            pool.epoch_id = pool.epoch_id + 1;
        };
        pool.epoch_armed = false;
        pool.epoch_first_breach_ms = 0;
        pool.epoch_breached = false;
        pool.epoch_confirmed_ms = 0;
        pool.epoch_breach_price = 0;
        event::emit(PoolEpochRecovered {
            pool: object::id(pool),
            epoch_id: closed_epoch,
            next_epoch_id: pool.epoch_id,
            price: price_mag,
            at_ms: clock::timestamp_ms(clock),
        });
    }

    #[allow(lint(self_transfer))]
    fun do_latch<T>(
        pool: &mut DepegCoverPool<T>,
        policy: &mut Policy<T>,
        price_mag: u64,
        conf: u64,
        clock: &Clock,
        ctx: &mut TxContext,
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
        do_pool_latch(pool, price_mag, conf, clock, ctx);
        if (
            policy.epoch_id == pool.epoch_id &&
            pool.epoch_armed &&
            policy.activation_ms <= pool.epoch_first_breach_ms &&
            (!policy.armed || policy.first_breach_ms != pool.epoch_first_breach_ms)
        ) {
            policy.armed = true;
            policy.first_breach_ms = pool.epoch_first_breach_ms;
            policy.breach_price = pool.epoch_breach_price;
            event::emit(BreachArmed {
                pool: object::id(pool),
                price: pool.epoch_breach_price,
                at_ms: pool.epoch_first_breach_ms,
            });
        };
        if (epoch_claims_policy(pool, policy)) {
            let policy_id = object::id(policy);
            assert!(table::contains(&pool.policies, policy_id), EPolicyNotActive);
            table::borrow_mut(&mut pool.policies, policy_id).breached = true;
            policy.breach_price = table::borrow(&pool.epochs, policy.epoch_id).price;
            policy.breached = true;
            event::emit(BreachConfirmed { pool: object::id(pool), price: policy.breach_price });
        };
    }

    /// Claim a latched policy — pays after the pool epoch made the policy eligible
    /// or after the compatibility path marked the owned policy from that same epoch.
    /// No Pyth read is needed at claim time.
    public fun claim_latched<T>(
        pool: &mut DepegCoverPool<T>,
        policy: Policy<T>,
        ctx: &mut TxContext,
    ): Coin<T> {
        assert!(policy.breached || epoch_claims_policy(pool, &policy), ENotBreached);
        settle(pool, policy, ctx)
    }

    // --- Governance (AdminCap-gated) ---
    // Pause is an immediate emergency lever; it halts new deposits/cover but NEVER the
    // claim path. Parameter changes go through the pool's timelock so LPs and holders
    // can see them coming.

    fun assert_admin<T>(pool: &DepegCoverPool<T>, cap: &AdminCap) {
        assert!(cap.pool_id == object::id(pool), EWrongAdminCap);
    }

    /// Pause or unpause new deposits and cover purchases (claims stay open).
    public fun set_paused<T>(pool: &mut DepegCoverPool<T>, cap: &AdminCap, paused: bool) {
        assert_admin(pool, cap);
        pool.paused = paused;
        event::emit(PausedSet { pool: object::id(pool), paused });
    }

    /// Enable or disable the direct wallet purchase path. Pools default to
    /// adapter-only; opening direct sales lets any wallet buy cover from this pool.
    public fun set_direct_sales<T>(pool: &mut DepegCoverPool<T>, cap: &AdminCap, enabled: bool) {
        assert_admin(pool, cap);
        pool.direct_sales_enabled = enabled;
        event::emit(DirectSalesSet { pool: object::id(pool), enabled });
    }

    /// Withdraw protocol fees without touching LP funds or policy collateral.
    public fun withdraw_treasury<T>(
        pool: &mut DepegCoverPool<T>,
        cap: &AdminCap,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<T> {
        assert_admin(pool, cap);
        coin::take(&mut pool.treasury, amount, ctx)
    }

    /// Propose a timelocked parameter update; replaces any pending one. `kind` selects
    /// the field (see the K_* constants), `value` is the new u64 value.
    public fun propose_param_update<T>(
        pool: &mut DepegCoverPool<T>,
        cap: &AdminCap,
        kind: u8,
        value: u64,
        clock: &Clock,
    ) {
        assert_admin(pool, cap);
        assert!(kind <= K_MAX_POLICY_DURATION_SECS, EBadParamKind);
        assert_valid_param_value(pool, kind, value);
        assert_can_update_param(pool, kind);
        let eta_ms = clock::timestamp_ms(clock) + pool.timelock_secs * 1000;
        pool.pending = option::some(PendingParamUpdate { kind, value, eta_ms });
        event::emit(ParamUpdateProposed { pool: object::id(pool), kind, value, eta_ms });
    }

    /// Execute the pending parameter update once its timelock has elapsed.
    public fun execute_param_update<T>(
        pool: &mut DepegCoverPool<T>,
        cap: &AdminCap,
        clock: &Clock,
    ) {
        assert_admin(pool, cap);
        assert!(option::is_some(&pool.pending), ENoPendingUpdate);
        let u = *option::borrow(&pool.pending);
        assert!(clock::timestamp_ms(clock) >= u.eta_ms, ETimelockNotElapsed);
        assert_can_update_param(pool, u.kind);
        apply_param(pool, u.kind, u.value);
        pool.pending = option::none();
        event::emit(ParamUpdateExecuted { pool: object::id(pool), kind: u.kind, value: u.value });
    }

    /// Cancel the pending parameter update without applying it.
    public fun cancel_param_update<T>(pool: &mut DepegCoverPool<T>, cap: &AdminCap) {
        assert_admin(pool, cap);
        assert!(option::is_some(&pool.pending), ENoPendingUpdate);
        let u = option::extract(&mut pool.pending);
        event::emit(ParamUpdateCancelled { pool: object::id(pool), kind: u.kind });
    }

    fun apply_param<T>(pool: &mut DepegCoverPool<T>, kind: u8, value: u64) {
        assert_valid_param_value(pool, kind, value);
        if (kind == K_THRESHOLD) { pool.threshold = value }
        else if (kind == K_PREMIUM_BPS) { pool.premium_bps = value }
        else if (kind == K_SURGE_PREMIUM_BPS) { pool.surge_premium_bps = value }
        else if (kind == K_MAX_AGE_SECS) { pool.max_age_secs = value }
        else if (kind == K_MAX_CONF_BPS) { pool.max_conf_bps = value }
        else if (kind == K_MIN_DWELL_SECS) { pool.min_dwell_secs = value }
        else if (kind == K_ACTIVATION_DELAY_SECS) { pool.activation_delay_secs = value }
        else if (kind == K_MAX_COVER_PER_POLICY) { pool.max_cover_per_policy = value }
        else if (kind == K_MAX_TOTAL_COVER) { pool.max_total_cover = value }
        else if (kind == K_TREASURY_FEE_BPS) { pool.treasury_fee_bps = value }
        else if (kind == K_KEEPER_BOUNTY) { pool.keeper_bounty = value }
        else { pool.max_policy_duration_secs = value } // K_MAX_POLICY_DURATION_SECS
    }

    fun assert_valid_param_value<T>(pool: &DepegCoverPool<T>, kind: u8, value: u64) {
        if (kind == K_THRESHOLD) {
            assert!(value > 0, EBadParamValue)
        } else if (kind == K_PREMIUM_BPS) {
            assert!(value > 0 && value <= (BPS as u64), EBadParamValue)
        } else if (kind == K_SURGE_PREMIUM_BPS) {
            assert!(value <= (BPS as u64), EBadParamValue)
        } else if (kind == K_MAX_AGE_SECS) {
            assert!(value > 0 && value <= 3_600, EBadParamValue)
        } else if (kind == K_MAX_CONF_BPS) {
            assert!(value > 0 && value <= (BPS as u64), EBadParamValue)
        } else if (kind == K_MIN_DWELL_SECS) {
            assert!(value >= MIN_DWELL_FLOOR_SECS && value <= pool.max_policy_duration_secs, EBadParamValue)
        } else if (kind == K_ACTIVATION_DELAY_SECS) {
            assert!(value >= MIN_ACTIVATION_DELAY_SECS && value < pool.max_policy_duration_secs, EBadParamValue)
        } else if (kind == K_MAX_COVER_PER_POLICY) {
            assert!(value == 0 || pool.max_total_cover == 0 || value <= pool.max_total_cover, EBadParamValue)
        } else if (kind == K_MAX_TOTAL_COVER) {
            assert!(value == 0 || value >= pool.total_cover, EBadParamValue)
        } else if (kind == K_TREASURY_FEE_BPS) {
            assert!(value <= 2_000, EBadParamValue)
        } else if (kind == K_KEEPER_BOUNTY) {
            assert!(value <= 1_000_000_000, EBadParamValue)
        } else {
            assert!(
                value > pool.activation_delay_secs &&
                    value >= pool.min_dwell_secs &&
                    value <= 7_776_000,
                EBadParamValue,
            )
        }
    }

    fun is_settlement_param(kind: u8): bool {
        kind == K_THRESHOLD ||
            kind == K_MAX_AGE_SECS ||
            kind == K_MAX_CONF_BPS ||
            kind == K_MIN_DWELL_SECS ||
            kind == K_ACTIVATION_DELAY_SECS ||
            kind == K_MAX_POLICY_DURATION_SECS
    }

    fun assert_can_update_param<T>(pool: &DepegCoverPool<T>, kind: u8) {
        if (is_settlement_param(kind)) {
            assert!(
                pool.total_cover == 0 && !pool.epoch_armed && !pool.epoch_breached,
                EOutstandingCover,
            );
        }
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
    public fun max_policy_duration_secs<T>(pool: &DepegCoverPool<T>): u64 { pool.max_policy_duration_secs }
    public fun max_cover_per_policy<T>(pool: &DepegCoverPool<T>): u64 { pool.max_cover_per_policy }
    public fun max_total_cover<T>(pool: &DepegCoverPool<T>): u64 { pool.max_total_cover }
    public fun treasury_fee_bps<T>(pool: &DepegCoverPool<T>): u64 { pool.treasury_fee_bps }
    public fun keeper_bounty<T>(pool: &DepegCoverPool<T>): u64 { pool.keeper_bounty }
    public fun treasury_value<T>(pool: &DepegCoverPool<T>): u64 { balance::value(&pool.treasury) }
    public fun is_paused<T>(pool: &DepegCoverPool<T>): bool { pool.paused }
    public fun direct_sales_enabled<T>(pool: &DepegCoverPool<T>): bool { pool.direct_sales_enabled }
    public fun timelock_secs<T>(pool: &DepegCoverPool<T>): u64 { pool.timelock_secs }
    public fun has_pending_update<T>(pool: &DepegCoverPool<T>): bool { option::is_some(&pool.pending) }
    public fun epoch_id<T>(pool: &DepegCoverPool<T>): u64 { pool.epoch_id }
    public fun epoch_armed<T>(pool: &DepegCoverPool<T>): bool { pool.epoch_armed }
    public fun epoch_first_breach_ms<T>(pool: &DepegCoverPool<T>): u64 { pool.epoch_first_breach_ms }
    public fun epoch_breached<T>(pool: &DepegCoverPool<T>): bool { pool.epoch_breached }
    public fun epoch_confirmed_ms<T>(pool: &DepegCoverPool<T>): u64 { pool.epoch_confirmed_ms }
    public fun epoch_breach_price<T>(pool: &DepegCoverPool<T>): u64 { pool.epoch_breach_price }

    public fun shares<T>(s: &LpShare<T>): u64 { s.shares }
    public fun policy_cover<T>(p: &Policy<T>): u64 { p.cover }
    public fun policy_expiry_ms<T>(p: &Policy<T>): u64 { p.expiry_ms }
    public fun policy_breached<T>(p: &Policy<T>): bool { p.breached }
    public fun policy_epoch_id<T>(p: &Policy<T>): u64 { p.epoch_id }
    public fun policy_claimable_by_pool_epoch<T>(
        pool: &DepegCoverPool<T>,
        p: &Policy<T>,
    ): bool { epoch_claims_policy(pool, p) }
    public fun policy_armed<T>(p: &Policy<T>): bool { p.armed }
    public fun policy_first_breach_ms<T>(p: &Policy<T>): u64 { p.first_breach_ms }
    public fun policy_activation_ms<T>(p: &Policy<T>): u64 { p.activation_ms }
    public fun policy_id<T>(p: &Policy<T>): ID { object::id(p) }
    public fun buyer_cap_pool_id<T>(cap: &BuyerCap<T>): ID { cap.pool_id }

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
        max_policy_duration_secs: u64,
        max_cover_per_policy: u64,
        max_total_cover: u64,
        timelock_secs: u64,
        treasury_fee_bps: u64,
        keeper_bounty: u64,
        ctx: &mut TxContext,
    ): DepegCoverPool<T> {
        build_pool<T>(
            feed_id, expo_neg, expo_mag, threshold, max_age_secs, premium_bps,
            surge_premium_bps, max_conf_bps, min_dwell_secs, activation_delay_secs,
            max_policy_duration_secs, max_cover_per_policy, max_total_cover,
            timelock_secs, treasury_fee_bps, keeper_bounty, ctx,
        )
    }

    #[test_only]
    /// Mint an AdminCap for a pool in tests (production caps are minted only at
    /// `create_and_share`).
    public fun new_admin_cap_for_testing<T>(
        pool: &DepegCoverPool<T>,
        ctx: &mut TxContext,
    ): AdminCap {
        AdminCap { id: object::new(ctx), pool_id: object::id(pool) }
    }

    #[test_only]
    public fun new_buyer_cap_for_testing<T>(
        pool: &DepegCoverPool<T>,
        ctx: &mut TxContext,
    ): BuyerCap<T> {
        BuyerCap<T> { id: object::new(ctx), pool_id: object::id(pool) }
    }

    #[test_only]
    public fun buy_cover_at_price_for_testing<T>(
        pool: &mut DepegCoverPool<T>,
        premium: Coin<T>,
        cover: u64,
        expiry_ms: u64,
        price_mag: u64,
        conf: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Policy<T> {
        let (policy, refund) =
            buy_cover_checked(pool, premium, cover, expiry_ms, price_mag, conf, clock, ctx);
        coin::destroy_zero(refund);
        policy
    }

    #[test_only]
    public fun buy_cover_with_cap_at_price_for_testing<T>(
        pool: &mut DepegCoverPool<T>,
        cap: &BuyerCap<T>,
        premium: Coin<T>,
        cover: u64,
        expiry_ms: u64,
        price_mag: u64,
        conf: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Policy<T> {
        assert!(cap.pool_id == object::id(pool), EWrongBuyerCap);
        let (policy, refund) =
            buy_cover_checked(pool, premium, cover, expiry_ms, price_mag, conf, clock, ctx);
        coin::destroy_zero(refund);
        policy
    }

    #[test_only]
    public fun buy_cover_at_price_with_refund_for_testing<T>(
        pool: &mut DepegCoverPool<T>,
        premium: Coin<T>,
        cover: u64,
        expiry_ms: u64,
        price_mag: u64,
        conf: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): (Policy<T>, Coin<T>) {
        buy_cover_checked(pool, premium, cover, expiry_ms, price_mag, conf, clock, ctx)
    }

    #[test_only]
    /// Drive the dwell latch at a given price magnitude (no Pyth object), so the
    /// arm/confirm + capital logic is unit-testable without a live PriceInfoObject.
    public fun latch_at_price_for_testing<T>(
        pool: &mut DepegCoverPool<T>,
        policy: &mut Policy<T>,
        price_mag: u64,
        conf: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        do_latch(pool, policy, price_mag, conf, clock, ctx);
    }

    #[test_only]
    public fun latch_pool_at_price_for_testing<T>(
        pool: &mut DepegCoverPool<T>,
        price_mag: u64,
        conf: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        do_pool_latch(pool, price_mag, conf, clock, ctx);
    }

    #[test_only]
    public fun recover_pool_at_price_for_testing<T>(
        pool: &mut DepegCoverPool<T>,
        price_mag: u64,
        conf: u64,
        clock: &Clock,
    ) {
        do_pool_recovery(pool, price_mag, conf, clock);
    }
}
