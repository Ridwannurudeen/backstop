/// Trustless cover pool — claims settle against DeepBook Predict's own oracle.
///
/// Unlike `cover_pool` (which settles on Backstop's RiskFeed), an `OracleCoverPool`
/// is bound to a real `deepbook_predict::oracle::OracleSVI` and a strike. A claim
/// reads that oracle directly on-chain — `is_settled()` + `settlement_price()` — and
/// pays iff the underlying settled at or below the strike (a DOWN-binary crash).
/// There is no Backstop-controlled value in the settlement path: it is as trustless
/// as DeepBook itself. (DOWN is in-the-money iff `settlement_price <= strike`,
/// verified against the Predict `compute_price` logic.)
module oracle_pool::oracle_pool {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::event;
    use deepbook_predict::oracle::{Self, OracleSVI};

    const EZeroAmount: u64 = 0;
    const EInsufficientPremium: u64 = 1;
    const EInsolvent: u64 = 2;
    const EWrongPool: u64 = 3;
    const EWrongOracle: u64 = 4;
    const ENotSettled: u64 = 5;
    const ENotInTheMoney: u64 = 6;
    const EStillInTheMoney: u64 = 7;
    const EBelowMinInitialLiquidity: u64 = 8;
    const EZeroShares: u64 = 9;

    /// First-depositor inflation / round-to-zero mitigation (Uniswap V2 style):
    /// the first deposit must seed at least `MIN_INITIAL_LIQUIDITY`, and
    /// `DEAD_SHARES` are permanently locked (owned by no `LpShare`). `buy_cover`
    /// joins premium into `funds` without minting shares, so without this guard an
    /// attacker could seed a 1-share pool, inflate `funds`, and make a later honest
    /// deposit round to 0 shares while their capital stays in the pool. Locking
    /// dead shares keeps the share price from being cheaply manipulated; the
    /// `shares > 0` assert below rejects any deposit that would still round to zero.
    const MIN_INITIAL_LIQUIDITY: u64 = 1_000;
    const DEAD_SHARES: u64 = 100;

    /// A cover pool bound to one DeepBook oracle + DOWN strike (1e9-scaled, the
    /// same scale as the oracle's settlement price).
    public struct OracleCoverPool<phantom T> has key {
        id: UID,
        oracle_id: ID,
        strike: u64,
        funds: Balance<T>,
        total_shares: u64,
        total_cover: u64,
    }

    public struct LpShare<phantom T> has key, store {
        id: UID,
        pool_id: ID,
        shares: u64,
    }

    public struct Policy<phantom T> has key, store {
        id: UID,
        pool_id: ID,
        strike: u64,
        cover: u64,
    }

    public struct PoolCreated has copy, drop { pool: ID, oracle_id: ID, strike: u64 }
    public struct CoverBought has copy, drop { pool: ID, cover: u64, premium: u64 }
    public struct ClaimPaid has copy, drop { pool: ID, cover: u64, settlement_price: u64 }

    // --- Lifecycle ---

    public fun new_pool<T>(oracle_id: ID, strike: u64, ctx: &mut TxContext): OracleCoverPool<T> {
        OracleCoverPool {
            id: object::new(ctx),
            oracle_id,
            strike,
            funds: balance::zero<T>(),
            total_shares: 0,
            total_cover: 0,
        }
    }

    /// Create and share a pool bound to a live DeepBook oracle + DOWN strike.
    public entry fun create_and_share<T>(
        oracle: &OracleSVI,
        strike: u64,
        ctx: &mut TxContext,
    ) {
        let oracle_id = oracle::id(oracle);
        let pool = new_pool<T>(oracle_id, strike, ctx);
        event::emit(PoolCreated { pool: object::id(&pool), oracle_id, strike });
        transfer::share_object(pool);
    }

    // --- Liquidity ---

    public fun deposit_lp<T>(
        pool: &mut OracleCoverPool<T>,
        coin: Coin<T>,
        ctx: &mut TxContext,
    ): LpShare<T> {
        let amount = coin::value(&coin);
        assert!(amount > 0, EZeroAmount);
        let before = balance::value(&pool.funds);
        let shares = if (pool.total_shares == 0 || before == 0) {
            assert!(amount >= MIN_INITIAL_LIQUIDITY, EBelowMinInitialLiquidity);
            pool.total_shares = pool.total_shares + DEAD_SHARES;
            amount - DEAD_SHARES
        } else {
            (((amount as u128) * (pool.total_shares as u128)) / (before as u128)) as u64
        };
        assert!(shares > 0, EZeroShares);
        balance::join(&mut pool.funds, coin::into_balance(coin));
        pool.total_shares = pool.total_shares + shares;
        LpShare { id: object::new(ctx), pool_id: object::id(pool), shares }
    }

    public fun withdraw_lp<T>(
        pool: &mut OracleCoverPool<T>,
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

    /// Buy DOWN cover. The buyer pays `premium` (>= 0) into the pool; the pool must
    /// remain fully collateralized (`funds >= total_cover`) after taking the cover.
    public fun buy_cover<T>(
        pool: &mut OracleCoverPool<T>,
        premium: Coin<T>,
        cover: u64,
        ctx: &mut TxContext,
    ): Policy<T> {
        assert!(cover > 0, EZeroAmount);
        let paid = coin::value(&premium);
        balance::join(&mut pool.funds, coin::into_balance(premium));
        assert!(balance::value(&pool.funds) >= pool.total_cover + cover, EInsolvent);
        pool.total_cover = pool.total_cover + cover;
        event::emit(CoverBought { pool: object::id(pool), cover, premium: paid });
        Policy { id: object::new(ctx), pool_id: object::id(pool), strike: pool.strike, cover }
    }

    /// Claim a policy — TRUSTLESS: reads DeepBook's own oracle on-chain. Pays iff
    /// the bound oracle is settled and the underlying settled at/below the strike.
    public fun claim<T>(
        pool: &mut OracleCoverPool<T>,
        oracle: &OracleSVI,
        policy: Policy<T>,
        ctx: &mut TxContext,
    ): Coin<T> {
        assert!(oracle::id(oracle) == pool.oracle_id, EWrongOracle);
        assert!(oracle::is_settled(oracle), ENotSettled);
        let sp = oracle::settlement_price(oracle).destroy_some();
        settle(pool, sp, policy, ctx)
    }

    /// Free an expired policy that finished out-of-the-money (no crash): the
    /// premium stays with the LPs.
    public fun expire_policy<T>(
        pool: &mut OracleCoverPool<T>,
        oracle: &OracleSVI,
        policy: Policy<T>,
    ) {
        assert!(oracle::id(oracle) == pool.oracle_id, EWrongOracle);
        assert!(oracle::is_settled(oracle), ENotSettled);
        let sp = oracle::settlement_price(oracle).destroy_some();
        let Policy { id, pool_id, strike, cover } = policy;
        assert!(pool_id == object::id(pool), EWrongPool);
        assert!(sp > strike, EStillInTheMoney);
        object::delete(id);
        pool.total_cover = pool.total_cover - cover;
    }

    /// Settlement core — `settlement_price` already read. Pays `cover` iff the
    /// DOWN binary is in-the-money (`settlement_price <= strike`).
    fun settle<T>(
        pool: &mut OracleCoverPool<T>,
        settlement_price: u64,
        policy: Policy<T>,
        ctx: &mut TxContext,
    ): Coin<T> {
        let Policy { id, pool_id, strike, cover } = policy;
        assert!(pool_id == object::id(pool), EWrongPool);
        assert!(settlement_price <= strike, ENotInTheMoney);
        object::delete(id);
        pool.total_cover = pool.total_cover - cover;
        event::emit(ClaimPaid { pool: object::id(pool), cover, settlement_price });
        coin::take(&mut pool.funds, cover, ctx)
    }

    // --- Views ---

    public fun pool_value<T>(pool: &OracleCoverPool<T>): u64 { balance::value(&pool.funds) }
    public fun total_cover<T>(pool: &OracleCoverPool<T>): u64 { pool.total_cover }
    public fun strike<T>(pool: &OracleCoverPool<T>): u64 { pool.strike }
    public fun oracle_id<T>(pool: &OracleCoverPool<T>): ID { pool.oracle_id }
    public fun shares<T>(s: &LpShare<T>): u64 { s.shares }
    public fun policy_cover<T>(p: &Policy<T>): u64 { p.cover }

    #[test_only]
    public fun new_pool_for_testing<T>(oracle_id: ID, strike: u64, ctx: &mut TxContext): OracleCoverPool<T> {
        new_pool<T>(oracle_id, strike, ctx)
    }

    #[test_only]
    /// Exercise the settlement payout with a given settlement price (no oracle).
    public fun claim_settled_for_testing<T>(
        pool: &mut OracleCoverPool<T>,
        settlement_price: u64,
        policy: Policy<T>,
        ctx: &mut TxContext,
    ): Coin<T> {
        settle(pool, settlement_price, policy, ctx)
    }
}
