#[test_only]
module pool_registry::pool_registry_tests {
    use std::string;
    use sui::clock;
    use sui::test_utils;
    use pool_registry::pool_registry::{Self, PoolRegistry, RegistryCap};

    fun dummy_id(ctx: &mut TxContext): ID {
        let uid = object::new(ctx);
        let id = object::uid_to_inner(&uid);
        object::delete(uid);
        id
    }

    fun setup(ctx: &mut TxContext): (PoolRegistry, RegistryCap) {
        pool_registry::new_for_testing(ctx)
    }

    #[test]
    fun registers_multiple_markets() {
        let mut ctx = tx_context::dummy();
        let (mut reg, cap) = setup(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        let btc = dummy_id(&mut ctx);
        let eth = dummy_id(&mut ctx);
        pool_registry::register(&mut reg, &cap, string::utf8(b"BTC"), btc, 1000, 11_000, &clock);
        pool_registry::register(&mut reg, &cap, string::utf8(b"ETH"), eth, 2000, 10_000, &clock);

        assert!(pool_registry::count(&reg) == 2, 0);
        assert!(pool_registry::has(&reg, string::utf8(b"BTC")), 1);
        assert!(pool_registry::has(&reg, string::utf8(b"ETH")), 2);
        assert!(pool_registry::pool_for(&reg, string::utf8(b"BTC")) == btc, 3);
        assert!(pool_registry::pool_for(&reg, string::utf8(b"ETH")) == eth, 4);
        assert!(pool_registry::markets(&reg).length() == 2, 5);

        let info = pool_registry::info_for(&reg, string::utf8(b"BTC"));
        assert!(pool_registry::info_pool_id(info) == btc, 6);
        assert!(pool_registry::info_trigger_bps(info) == 1000, 7);
        assert!(pool_registry::info_loading_bps(info) == 11_000, 8);

        clock::destroy_for_testing(clock);
        test_utils::destroy(reg);
        test_utils::destroy(cap);
    }

    #[test]
    #[expected_failure(abort_code = pool_registry::EAlreadyRegistered)]
    fun duplicate_market_aborts() {
        let mut ctx = tx_context::dummy();
        let (mut reg, cap) = setup(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        let a = dummy_id(&mut ctx);
        let b = dummy_id(&mut ctx);
        pool_registry::register(&mut reg, &cap, string::utf8(b"BTC"), a, 1000, 11_000, &clock);
        pool_registry::register(&mut reg, &cap, string::utf8(b"BTC"), b, 1500, 12_000, &clock);

        clock::destroy_for_testing(clock);
        test_utils::destroy(reg);
        test_utils::destroy(cap);
    }

    #[test]
    #[expected_failure(abort_code = pool_registry::ENotFound)]
    fun pool_for_missing_aborts() {
        let mut ctx = tx_context::dummy();
        let (reg, cap) = setup(&mut ctx);

        let _ = pool_registry::pool_for(&reg, string::utf8(b"BTC"));

        test_utils::destroy(reg);
        test_utils::destroy(cap);
    }

    #[test]
    fun update_and_deprecate_market() {
        let mut ctx = tx_context::dummy();
        let (mut reg, cap) = setup(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        let v1 = dummy_id(&mut ctx);
        let v2 = dummy_id(&mut ctx);
        pool_registry::register(&mut reg, &cap, string::utf8(b"BTC"), v1, 1000, 11_000, &clock);
        assert!(pool_registry::pool_for(&reg, string::utf8(b"BTC")) == v1, 0);

        // Correct a stale/wrong pointer in place.
        pool_registry::update(&mut reg, &cap, string::utf8(b"BTC"), v2, 1500, 12_000, &clock);
        assert!(pool_registry::pool_for(&reg, string::utf8(b"BTC")) == v2, 1);
        assert!(pool_registry::count(&reg) == 1, 2);

        // Deprecate it — no longer discoverable.
        pool_registry::deprecate(&mut reg, &cap, string::utf8(b"BTC"));
        assert!(!pool_registry::has(&reg, string::utf8(b"BTC")), 3);
        assert!(pool_registry::count(&reg) == 0, 4);
        assert!(pool_registry::markets(&reg).length() == 0, 5);

        clock::destroy_for_testing(clock);
        test_utils::destroy(reg);
        test_utils::destroy(cap);
    }

    #[test]
    #[expected_failure(abort_code = pool_registry::ENotFound)]
    fun update_missing_aborts() {
        let mut ctx = tx_context::dummy();
        let (mut reg, cap) = setup(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        let v = dummy_id(&mut ctx);
        pool_registry::update(&mut reg, &cap, string::utf8(b"BTC"), v, 1000, 11_000, &clock);

        clock::destroy_for_testing(clock);
        test_utils::destroy(reg);
        test_utils::destroy(cap);
    }
}
