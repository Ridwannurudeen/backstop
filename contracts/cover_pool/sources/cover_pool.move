/// Backstop CoverPool — a native, fully-collateralized parametric cover pool.
///
/// This is the capital lane the RiskFeed was built to enable. LPs supply capital
/// and earn premiums; a policyholder buys parametric cover whose premium is priced
/// on-chain off the live `RiskFeed` probability of failure; and when that market's
/// reading crosses the policy's trigger, the holder claims a payout straight from
/// the pool. No external venue, no IMM — the pool itself underwrites and settles.
///
/// The pool is always fully collateralized: `value(funds) >= total_cover`. A
/// parametric mutual must be able to pay every outstanding liability at all times.
module cover_pool::cover_pool {
    use std::string::{Self, String};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::event;
    use risk_feed::risk_feed::{Self, RiskFeed};

    /// Basis-points denominator.
    const BPS: u128 = 10_000;

    /// Cover or deposit amount must be non-zero.
    const EZeroAmount: u64 = 0;
    /// Premium paid is less than the feed-priced premium.
    const EInsufficientPremium: u64 = 1;
    /// Pool cannot back the requested cover (would break full collateralization).
    const EInsolvent: u64 = 2;
    /// Policy/LP share belongs to a different pool.
    const EWrongPool: u64 = 3;
    /// Claim attempted but the market reading is below the policy trigger.
    const ENotTriggered: u64 = 4;
    /// Policy has expired (claim) / has not yet expired (expire_policy).
    const EPolicyExpired: u64 = 5;
    const ENotExpired: u64 = 6;

    /// Shared mutualized cover pool underwriting one RiskFeed market in coin `T`.
    public struct CoverPool<phantom T> has key {
        id: UID,
        /// RiskFeed market key this pool underwrites (e.g. b"BTC<56901@...").
        market: String,
        /// Claim pays when the feed's prob_bps for `market` is >= this.
        trigger_bps: u64,
        /// Premium loading on top of the fair (feed-implied) premium, in bps of
        /// 10_000 (e.g. 11_000 = 1.1x fair). 10_000 = fair, no load.
        loading_bps: u64,
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

    /// A parametric cover policy: pays `cover` if the market triggers before expiry.
    public struct Policy<phantom T> has key, store {
        id: UID,
        pool_id: ID,
        market: String,
        trigger_bps: u64,
        cover: u64,
        premium_paid: u64,
        expiry_ms: u64,
    }

    public struct PoolCreated has copy, drop {
        pool: ID,
        market: String,
        trigger_bps: u64,
        loading_bps: u64,
    }

    public struct CoverBought has copy, drop {
        pool: ID,
        market: String,
        cover: u64,
        premium: u64,
        trigger_bps: u64,
        expiry_ms: u64,
    }

    public struct Claimed has copy, drop {
        pool: ID,
        market: String,
        cover: u64,
        prob_bps: u64,
    }

    // --- Pool lifecycle ---

    public fun new_pool<T>(
        market: String,
        trigger_bps: u64,
        loading_bps: u64,
        ctx: &mut TxContext,
    ): CoverPool<T> {
        CoverPool {
            id: object::new(ctx),
            market,
            trigger_bps,
            loading_bps,
            funds: balance::zero<T>(),
            total_shares: 0,
            total_cover: 0,
        }
    }

    /// Create and share a cover pool for `market` (UTF-8 bytes).
    public entry fun create_and_share<T>(
        market: vector<u8>,
        trigger_bps: u64,
        loading_bps: u64,
        ctx: &mut TxContext,
    ) {
        let pool = new_pool<T>(string::utf8(market), trigger_bps, loading_bps, ctx);
        event::emit(PoolCreated {
            pool: object::id(&pool),
            market: pool.market,
            trigger_bps,
            loading_bps,
        });
        transfer::share_object(pool);
    }

    // --- Liquidity provision ---

    /// Supply capital and receive LP shares. Shares are minted pro-rata to the
    /// pool's value before this deposit (the first deposit anchors 1 share = 1 unit).
    public fun deposit_lp<T>(
        pool: &mut CoverPool<T>,
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
        pool: &mut CoverPool<T>,
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

    /// Feed-priced premium for `cover` units: fair = cover * prob, then loaded.
    public fun premium_for<T>(pool: &CoverPool<T>, feed: &RiskFeed, cover: u64): u64 {
        let prob_bps = risk_feed::probability_bps(feed, pool.market);
        let fair = ((cover as u128) * (prob_bps as u128)) / BPS;
        ((fair * (pool.loading_bps as u128)) / BPS) as u64
    }

    /// Buy parametric cover. `premium` must cover the feed-priced premium; any
    /// excess stays in the pool (accrues to LPs). The pool must remain fully
    /// collateralized after taking on the new liability.
    public fun buy_cover<T>(
        pool: &mut CoverPool<T>,
        feed: &RiskFeed,
        premium: Coin<T>,
        cover: u64,
        expiry_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Policy<T> {
        assert!(cover > 0, EZeroAmount);
        assert!(expiry_ms > clock::timestamp_ms(clock), EPolicyExpired);
        let required = premium_for(pool, feed, cover);
        let paid = coin::value(&premium);
        assert!(paid >= required, EInsufficientPremium);
        balance::join(&mut pool.funds, coin::into_balance(premium));
        assert!(balance::value(&pool.funds) >= pool.total_cover + cover, EInsolvent);
        pool.total_cover = pool.total_cover + cover;
        event::emit(CoverBought {
            pool: object::id(pool),
            market: pool.market,
            cover,
            premium: paid,
            trigger_bps: pool.trigger_bps,
            expiry_ms,
        });
        Policy {
            id: object::new(ctx),
            pool_id: object::id(pool),
            market: pool.market,
            trigger_bps: pool.trigger_bps,
            cover,
            premium_paid: paid,
            expiry_ms,
        }
    }

    /// Claim a policy's payout. Succeeds only if, before expiry, the market's
    /// latest feed reading is at or above the policy trigger.
    public fun claim<T>(
        pool: &mut CoverPool<T>,
        feed: &RiskFeed,
        policy: Policy<T>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<T> {
        let Policy { id, pool_id, market, trigger_bps, cover, premium_paid: _, expiry_ms } = policy;
        assert!(pool_id == object::id(pool), EWrongPool);
        assert!(clock::timestamp_ms(clock) <= expiry_ms, EPolicyExpired);
        let prob_bps = risk_feed::probability_bps(feed, market);
        assert!(prob_bps >= trigger_bps, ENotTriggered);
        object::delete(id);
        pool.total_cover = pool.total_cover - cover;
        event::emit(Claimed { pool: object::id(pool), market, cover, prob_bps });
        coin::take(&mut pool.funds, cover, ctx)
    }

    /// Free the liability of an expired, untriggered policy (LP capital releases).
    /// Callable by the policy holder once expiry has passed.
    public fun expire_policy<T>(pool: &mut CoverPool<T>, policy: Policy<T>, clock: &Clock) {
        let Policy { id, pool_id, market: _, trigger_bps: _, cover, premium_paid: _, expiry_ms } = policy;
        assert!(pool_id == object::id(pool), EWrongPool);
        assert!(clock::timestamp_ms(clock) > expiry_ms, ENotExpired);
        object::delete(id);
        pool.total_cover = pool.total_cover - cover;
    }

    // --- Views ---

    public fun pool_value<T>(pool: &CoverPool<T>): u64 { balance::value(&pool.funds) }
    public fun total_shares<T>(pool: &CoverPool<T>): u64 { pool.total_shares }
    public fun total_cover<T>(pool: &CoverPool<T>): u64 { pool.total_cover }
    public fun market<T>(pool: &CoverPool<T>): String { pool.market }
    public fun trigger_bps<T>(pool: &CoverPool<T>): u64 { pool.trigger_bps }
    public fun loading_bps<T>(pool: &CoverPool<T>): u64 { pool.loading_bps }

    public fun shares<T>(s: &LpShare<T>): u64 { s.shares }
    public fun policy_cover<T>(p: &Policy<T>): u64 { p.cover }
    public fun policy_expiry_ms<T>(p: &Policy<T>): u64 { p.expiry_ms }
    public fun policy_trigger_bps<T>(p: &Policy<T>): u64 { p.trigger_bps }

    #[test_only]
    public fun new_pool_for_testing<T>(
        market: String,
        trigger_bps: u64,
        loading_bps: u64,
        ctx: &mut TxContext,
    ): CoverPool<T> {
        new_pool<T>(market, trigger_bps, loading_bps, ctx)
    }
}
