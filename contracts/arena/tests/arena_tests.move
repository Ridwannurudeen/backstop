#[test_only]
module arena::arena_tests {
    use sui::test_scenario as ts;
    use sui::test_utils;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use arena::arena::{Self, Arena, AdminCap};

    const ALICE: address = @0xA11CE; // well-calibrated agent
    const BOB: address = @0xB0B;     // miscalibrated agent

    fun sui_coin(amt: u64, ctx: &mut TxContext): Coin<SUI> {
        coin::mint_for_testing<SUI>(amt, ctx)
    }

    // Enroll Alice and Bob, each bonding 0.01 SUI.
    fun setup(): (ts::Scenario, Arena, AdminCap) {
        let mut sc = ts::begin(ALICE);
        let (mut arena, cap) = arena::new_for_testing(sc.ctx());
        arena::enroll(&mut arena, b"Alice", sui_coin(10_000_000, sc.ctx()), sc.ctx());
        sc.next_tx(BOB);
        arena::enroll(&mut arena, b"Bob", sui_coin(10_000_000, sc.ctx()), sc.ctx());
        (sc, arena, cap)
    }

    fun teardown(sc: ts::Scenario, arena: Arena, cap: AdminCap) {
        test_utils::destroy(arena);
        test_utils::destroy(cap);
        ts::end(sc);
    }

    #[test]
    fun enroll_two_agents() {
        let (sc, arena, cap) = setup();
        assert!(arena::agent_count(&arena) == 2, 0);
        assert!(arena::bond_of(&arena, ALICE) == 10_000_000, 1);
        assert!(arena::bond_of(&arena, BOB) == 10_000_000, 2);
        assert!(arena::is_enrolled(&arena, ALICE), 3);
        teardown(sc, arena, cap);
    }

    #[test]
    fun settle_scores_and_picks_winner() {
        let (mut sc, mut arena, cap) = setup();
        // Round 1: Alice 80% (close to a crash), Bob 20%.
        sc.next_tx(ALICE);
        arena::quote(&mut arena, b"BTC", 8000, sc.ctx());
        sc.next_tx(BOB);
        arena::quote(&mut arena, b"BTC", 2000, sc.ctx());

        sc.next_tx(ALICE);
        arena::settle_round(&mut arena, &cap, b"BTC", true, sc.ctx());

        // Alice called the crash → hit + closest → winner. Bob missed.
        assert!(arena::hits_of(&arena, ALICE) == 1, 0);
        assert!(arena::wins_of(&arena, ALICE) == 1, 1);
        assert!(arena::hits_of(&arena, BOB) == 0, 2);
        assert!(arena::wins_of(&arena, BOB) == 0, 3);
        teardown(sc, arena, cap);
    }

    #[test]
    fun slash_miscalibrated_agent() {
        let (mut sc, mut arena, cap) = setup();
        // Round 1.
        sc.next_tx(ALICE);
        arena::quote(&mut arena, b"BTC", 8000, sc.ctx());
        sc.next_tx(BOB);
        arena::quote(&mut arena, b"BTC", 2000, sc.ctx());
        sc.next_tx(ALICE);
        arena::settle_round(&mut arena, &cap, b"BTC", true, sc.ctx());

        // Round 2: Bob misses again → 0% accuracy over 2 quotes.
        sc.next_tx(BOB);
        arena::quote(&mut arena, b"BTC", 1000, sc.ctx());
        sc.next_tx(ALICE);
        arena::settle_round(&mut arena, &cap, b"BTC", true, sc.ctx());

        assert!(arena::quotes_of(&arena, BOB) == 2, 0);
        assert!(arena::accuracy_bps(&arena, BOB) == 0, 1);

        // Slash Bob: half of his current 0.01 SUI bond → 0.005 SUI returned.
        let payout = arena::slash_miscalibrated(&mut arena, &cap, BOB, 5000, sc.ctx());
        assert!(coin::value(&payout) == 5_000_000, 2);
        assert!(arena::bond_of(&arena, BOB) == 5_000_000, 3);
        coin::burn_for_testing(payout);
        teardown(sc, arena, cap);
    }

    #[test]
    #[expected_failure(abort_code = arena::ENotMiscalibrated)]
    fun cannot_slash_calibrated() {
        let (mut sc, mut arena, cap) = setup();
        sc.next_tx(ALICE);
        arena::quote(&mut arena, b"BTC", 8000, sc.ctx());
        arena::settle_round(&mut arena, &cap, b"BTC", true, sc.ctx());
        // Alice is 100% accurate → cannot be slashed.
        let payout = arena::slash_miscalibrated(&mut arena, &cap, ALICE, 5000, sc.ctx());
        coin::burn_for_testing(payout);
        teardown(sc, arena, cap);
    }

    #[test]
    #[expected_failure(abort_code = arena::EAlreadyEnrolled)]
    fun cannot_double_enroll() {
        let mut sc = ts::begin(ALICE);
        let (mut arena, cap) = arena::new_for_testing(sc.ctx());
        arena::enroll(&mut arena, b"Alice", sui_coin(10_000_000, sc.ctx()), sc.ctx());
        arena::enroll(&mut arena, b"Alice2", sui_coin(10_000_000, sc.ctx()), sc.ctx());
        teardown(sc, arena, cap);
    }

    #[test]
    #[expected_failure(abort_code = arena::ENotEnrolled)]
    fun cannot_quote_before_enroll() {
        let mut sc = ts::begin(ALICE);
        let (mut arena, cap) = arena::new_for_testing(sc.ctx());
        arena::quote(&mut arena, b"BTC", 5000, sc.ctx());
        teardown(sc, arena, cap);
    }
}
