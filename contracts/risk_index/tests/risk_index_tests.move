#[test_only]
module risk_index::risk_index_tests {
    use std::string;
    use sui::test_scenario as ts;
    use sui::test_utils;
    use sui::clock;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use risk_index::risk_index::{Self, RiskIndex, AdminCap};

    const ALICE: address = @0xA11CE; // publisher
    const BOB: address = @0xB0B;     // challenger

    const MKT: vector<u8> = b"BTC@30D";
    fun key(): string::String { string::utf8(MKT) }

    fun sui_coin(amt: u64, ctx: &mut TxContext): Coin<SUI> {
        coin::mint_for_testing<SUI>(amt, ctx)
    }

    // Register Alice as a publisher and publish one SRX reading.
    fun setup(): (ts::Scenario, RiskIndex, AdminCap, clock::Clock) {
        let mut sc = ts::begin(ALICE);
        let (mut index, admin) = risk_index::new_for_testing(sc.ctx());
        let clock = clock::create_for_testing(sc.ctx());
        risk_index::register_publisher(&mut index, b"Alice", sui_coin(100_000_000, sc.ctx()), sc.ctx());
        risk_index::publish(
            &mut index, MKT, b"BTC", 2_592_000_000, 60_000_000000000,
            1376, 6500, 800, b"walrus-cdf", &clock, sc.ctx(),
        );
        (sc, index, admin, clock)
    }

    fun teardown(sc: ts::Scenario, index: RiskIndex, admin: AdminCap, clock: clock::Clock) {
        clock::destroy_for_testing(clock);
        test_utils::destroy(index);
        test_utils::destroy(admin);
        ts::end(sc);
    }

    #[test]
    fun publish_and_read() {
        let (sc, index, admin, clock) = setup();
        assert!(risk_index::srx_crash(&index, key()) == 1376, 0);
        assert!(risk_index::srx_vol(&index, key()) == 6500, 1);
        assert!(risk_index::srx_tail(&index, key()) == 800, 2);
        assert!(risk_index::count(&index) == 1, 3);
        assert!(risk_index::stake_bond(&index, ALICE) == 100_000_000, 4);
        teardown(sc, index, admin, clock);
    }

    #[test]
    fun challenge_upheld_slashes_publisher() {
        let (mut sc, mut index, admin, clock) = setup();
        // Bob challenges with a 0.05 SUI bond.
        sc.next_tx(BOB);
        risk_index::challenge(&mut index, MKT, sui_coin(50_000_000, sc.ctx()), sc.ctx());
        assert!(risk_index::is_challenged(&index, key()), 0);

        // Admin upholds the challenge: Alice slashed 0.05, Bob paid 0.10.
        risk_index::resolve_challenge(&mut index, &admin, MKT, true, sc.ctx());
        assert!(risk_index::stake_bond(&index, ALICE) == 50_000_000, 1);
        assert!(!risk_index::is_challenged(&index, key()), 2);

        sc.next_tx(BOB);
        let paid = ts::take_from_sender<Coin<SUI>>(&sc);
        assert!(coin::value(&paid) == 100_000_000, 3); // bond back + slash reward
        ts::return_to_sender(&sc, paid);
        teardown(sc, index, admin, clock);
    }

    #[test]
    fun challenge_rejected_forfeits_to_publisher() {
        let (mut sc, mut index, admin, clock) = setup();
        sc.next_tx(BOB);
        risk_index::challenge(&mut index, MKT, sui_coin(50_000_000, sc.ctx()), sc.ctx());
        // Admin rejects: Bob's 0.05 bond joins Alice's stake → 0.15 total.
        risk_index::resolve_challenge(&mut index, &admin, MKT, false, sc.ctx());
        assert!(risk_index::stake_bond(&index, ALICE) == 150_000_000, 0);
        assert!(!risk_index::is_challenged(&index, key()), 1);
        teardown(sc, index, admin, clock);
    }

    #[test]
    #[expected_failure(abort_code = risk_index::ENotPublisher)]
    fun publish_without_stake_aborts() {
        let mut sc = ts::begin(BOB);
        let (mut index, admin) = risk_index::new_for_testing(sc.ctx());
        let clock = clock::create_for_testing(sc.ctx());
        // Bob never registered.
        risk_index::publish(
            &mut index, MKT, b"BTC", 2_592_000_000, 60_000_000000000,
            1000, 5000, 500, b"blob", &clock, sc.ctx(),
        );
        teardown(sc, index, admin, clock);
    }

    #[test]
    #[expected_failure(abort_code = risk_index::EBondTooLow)]
    fun register_below_min_aborts() {
        let mut sc = ts::begin(ALICE);
        let (mut index, admin) = risk_index::new_for_testing(sc.ctx());
        let clock = clock::create_for_testing(sc.ctx());
        risk_index::register_publisher(&mut index, b"Alice", sui_coin(1_000_000, sc.ctx()), sc.ctx());
        teardown(sc, index, admin, clock);
    }

    #[test]
    #[expected_failure(abort_code = risk_index::EAlreadyChallenged)]
    fun double_challenge_aborts() {
        let (mut sc, mut index, admin, clock) = setup();
        sc.next_tx(BOB);
        risk_index::challenge(&mut index, MKT, sui_coin(50_000_000, sc.ctx()), sc.ctx());
        risk_index::challenge(&mut index, MKT, sui_coin(50_000_000, sc.ctx()), sc.ctx());
        teardown(sc, index, admin, clock);
    }
}
