/// Backstop PoolRegistry — an on-chain directory of cover pools by market key.
///
/// A `CoverPool` is `key`-only, so it can't be shared by an external module; this
/// registry never creates pools. It just records the ID + parametric metadata of
/// each pool, keyed by the RiskFeed market it underwrites, so front-ends and other
/// contracts can discover the live pool for a market and enumerate the whole set.
module pool_registry::pool_registry {
    use std::string::String;
    use sui::table::{Self, Table};
    use sui::clock::{Self, Clock};
    use sui::event;

    /// A pool is already registered for this market key.
    const EAlreadyRegistered: u64 = 0;
    /// No pool registered for the requested market key.
    const ENotFound: u64 = 1;

    /// Metadata recorded for one registered cover pool.
    public struct PoolInfo has store, copy, drop {
        pool_id: ID,
        trigger_bps: u64,
        loading_bps: u64,
        created_ms: u64,
    }

    /// Shared directory of cover pools keyed by market. `markets` mirrors the keys
    /// of `pools` so the whole set is enumerable (a Table isn't iterable).
    public struct PoolRegistry has key {
        id: UID,
        pools: Table<String, PoolInfo>,
        markets: vector<String>,
        count: u64,
    }

    /// Authority to register pools in the registry.
    public struct RegistryCap has key, store {
        id: UID,
    }

    public struct PoolRegistered has copy, drop {
        market: String,
        pool_id: ID,
        trigger_bps: u64,
    }

    fun init(ctx: &mut TxContext) {
        let reg = PoolRegistry {
            id: object::new(ctx),
            pools: table::new(ctx),
            markets: vector[],
            count: 0,
        };
        transfer::share_object(reg);
        transfer::transfer(RegistryCap { id: object::new(ctx) }, ctx.sender());
    }

    /// Record a cover pool's ID + metadata under its market key. Aborts if a pool
    /// is already registered for `market`.
    public fun register(
        reg: &mut PoolRegistry,
        _cap: &RegistryCap,
        market: String,
        pool_id: ID,
        trigger_bps: u64,
        loading_bps: u64,
        clock: &Clock,
    ) {
        assert!(!table::contains(&reg.pools, market), EAlreadyRegistered);
        table::add(&mut reg.pools, market, PoolInfo {
            pool_id,
            trigger_bps,
            loading_bps,
            created_ms: clock::timestamp_ms(clock),
        });
        reg.markets.push_back(market);
        reg.count = reg.count + 1;
        event::emit(PoolRegistered { market, pool_id, trigger_bps });
    }

    // --- Views ---

    public fun count(reg: &PoolRegistry): u64 { reg.count }

    public fun has(reg: &PoolRegistry, market: String): bool {
        table::contains(&reg.pools, market)
    }

    public fun pool_for(reg: &PoolRegistry, market: String): ID {
        assert!(table::contains(&reg.pools, market), ENotFound);
        table::borrow(&reg.pools, market).pool_id
    }

    public fun info_for(reg: &PoolRegistry, market: String): &PoolInfo {
        assert!(table::contains(&reg.pools, market), ENotFound);
        table::borrow(&reg.pools, market)
    }

    public fun markets(reg: &PoolRegistry): vector<String> { reg.markets }

    public fun info_pool_id(info: &PoolInfo): ID { info.pool_id }
    public fun info_trigger_bps(info: &PoolInfo): u64 { info.trigger_bps }
    public fun info_loading_bps(info: &PoolInfo): u64 { info.loading_bps }

    #[test_only]
    public fun new_for_testing(ctx: &mut TxContext): (PoolRegistry, RegistryCap) {
        let reg = PoolRegistry {
            id: object::new(ctx),
            pools: table::new(ctx),
            markets: vector[],
            count: 0,
        };
        (reg, RegistryCap { id: object::new(ctx) })
    }
}
