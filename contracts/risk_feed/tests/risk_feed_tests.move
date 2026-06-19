#[test_only]
module risk_feed::risk_feed_tests {
    use std::string;
    use sui::test_scenario as ts;
    use sui::test_utils;
    use sui::clock;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use risk_feed::risk_feed::{Self, RiskFeed, PublisherCap};

    const ALICE: address = @0xA11CE; // bonded publisher
    const BOB: address = @0xB0B;     // challenger

    const MKT: vector<u8> = b"BTC<56901@1780992000000";
    fun key(): string::String { string::utf8(MKT) }
    fun blob(): string::String { string::utf8(b"walrus-blob") }

    fun sui_coin(amt: u64, ctx: &mut TxContext): Coin<SUI> {
        coin::mint_for_testing<SUI>(amt, ctx)
    }

    // Alice bonds 0.1 SUI and publishes one reading at t=1000.
    fun setup(): (ts::Scenario, RiskFeed, PublisherCap, clock::Clock) {
        let mut sc = ts::begin(ALICE);
        let (mut feed, cap) = risk_feed::new_for_testing(sc.ctx());
        let mut clock = clock::create_for_testing(sc.ctx());
        clock::set_for_testing(&mut clock, 1000);
        risk_feed::register_publisher(&mut feed, b"Alice", sui_coin(100_000_000, sc.ctx()), sc.ctx());
        risk_feed::publish_bonded(&mut feed, key(), 1914, 60_000_000000000, blob(), &clock, sc.ctx());
        (sc, feed, cap, clock)
    }

    fun teardown(sc: ts::Scenario, feed: RiskFeed, cap: PublisherCap, clock: clock::Clock) {
        clock::destroy_for_testing(clock);
        test_utils::destroy(feed);
        test_utils::destroy(cap);
        ts::end(sc);
    }

    #[test]
    fun bonded_publish_and_read() {
        let (sc, feed, cap, clock) = setup();
        assert!(risk_feed::probability_bps(&feed, key()) == 1914, 0);
        assert!(risk_feed::has_market(&feed, key()), 1);
        assert!(risk_feed::stake_bond(&feed, ALICE) == 100_000_000, 2);
        assert!(!risk_feed::is_challenged(&feed, key()), 3);
        teardown(sc, feed, cap, clock);
    }

    #[test]
    fun fresh_read_within_window() {
        let (sc, feed, cap, mut clock) = setup();
        // published at 1000; read at 1400 with a 500ms window → fresh.
        clock::set_for_testing(&mut clock, 1400);
        assert!(risk_feed::probability_bps_fresh(&feed, key(), &clock, 500) == 1914, 0);
        teardown(sc, feed, cap, clock);
    }

    #[test]
    #[expected_failure(abort_code = risk_feed::EStale)]
    fun stale_read_aborts() {
        let (sc, feed, cap, mut clock) = setup();
        // 1000ms old against a 500ms window → abort. This is the guard cover_pool lacked.
        clock::set_for_testing(&mut clock, 2000);
        let _ = risk_feed::probability_bps_fresh(&feed, key(), &clock, 500);
        teardown(sc, feed, cap, clock);
    }

    #[test]
    #[expected_failure(abort_code = risk_feed::EChallenged)]
    fun challenged_default_read_aborts() {
        let (mut sc, mut feed, cap, clock) = setup();
        sc.next_tx(BOB);
        risk_feed::challenge(&mut feed, key(), sui_coin(100_000_000, sc.ctx()), sc.ctx());
        let _ = risk_feed::probability_bps(&feed, key());
        teardown(sc, feed, cap, clock);
    }

    #[test]
    #[expected_failure(abort_code = risk_feed::EChallenged)]
    fun challenged_fresh_read_aborts() {
        let (mut sc, mut feed, cap, mut clock) = setup();
        sc.next_tx(BOB);
        risk_feed::challenge(&mut feed, key(), sui_coin(100_000_000, sc.ctx()), sc.ctx());
        clock::set_for_testing(&mut clock, 1400);
        let _ = risk_feed::probability_bps_fresh(&feed, key(), &clock, 500);
        teardown(sc, feed, cap, clock);
    }

    #[test]
    fun challenged_unchecked_read_is_explicit() {
        let (mut sc, mut feed, cap, clock) = setup();
        sc.next_tx(BOB);
        risk_feed::challenge(&mut feed, key(), sui_coin(100_000_000, sc.ctx()), sc.ctx());
        assert!(risk_feed::probability_bps_unchecked(&feed, key()) == 1914, 0);
        teardown(sc, feed, cap, clock);
    }

    #[test]
    fun challenge_upheld_slashes_to_sink() {
        let (mut sc, mut feed, cap, clock) = setup();
        sc.next_tx(BOB);
        risk_feed::challenge(&mut feed, key(), sui_coin(100_000_000, sc.ctx()), sc.ctx());
        assert!(risk_feed::is_challenged(&feed, key()), 0);

        // Uphold (resolver ALICE ≠ challenger BOB): SLASH_BPS=50% of Alice's 0.10 stake
        // → 0.05 left; the slashed 0.05 lands in the neutral sink, not Bob's pocket.
        // Bob only recovers his own 0.10 bond.
        sc.next_tx(ALICE);
        risk_feed::resolve_challenge(&mut feed, &cap, key(), true, sc.ctx());
        assert!(risk_feed::stake_bond(&feed, ALICE) == 50_000_000, 1);
        assert!(risk_feed::slashed_pool(&feed) == 50_000_000, 2);
        assert!(!risk_feed::is_challenged(&feed, key()), 3);

        sc.next_tx(BOB);
        let paid = ts::take_from_sender<Coin<SUI>>(&sc);
        assert!(coin::value(&paid) == 100_000_000, 4);
        ts::return_to_sender(&sc, paid);
        teardown(sc, feed, cap, clock);
    }

    #[test]
    fun challenge_rejected_forfeits_to_sink() {
        let (mut sc, mut feed, cap, clock) = setup();
        sc.next_tx(BOB);
        risk_feed::challenge(&mut feed, key(), sui_coin(100_000_000, sc.ctx()), sc.ctx());
        // Reject (resolver ALICE ≠ challenger BOB): Bob's bond is forfeited to the
        // neutral sink (not the publisher); Alice's stake is untouched.
        sc.next_tx(ALICE);
        risk_feed::resolve_challenge(&mut feed, &cap, key(), false, sc.ctx());
        assert!(risk_feed::stake_bond(&feed, ALICE) == 100_000_000, 0);
        assert!(risk_feed::slashed_pool(&feed) == 100_000_000, 1);
        assert!(!risk_feed::is_challenged(&feed, key()), 2);
        teardown(sc, feed, cap, clock);
    }

    #[test]
    #[expected_failure(abort_code = risk_feed::EAlreadyChallenged)]
    fun cannot_overwrite_challenged() {
        let (mut sc, mut feed, cap, clock) = setup();
        sc.next_tx(BOB);
        risk_feed::challenge(&mut feed, key(), sui_coin(100_000_000, sc.ctx()), sc.ctx());
        sc.next_tx(ALICE);
        // Overwriting a challenged market is blocked until it resolves.
        risk_feed::publish_bonded(&mut feed, key(), 2000, 60_000_000000000, blob(), &clock, sc.ctx());
        teardown(sc, feed, cap, clock);
    }

    #[test]
    #[expected_failure(abort_code = risk_feed::ENotPublisher)]
    fun publish_bonded_without_stake_aborts() {
        let mut sc = ts::begin(BOB);
        let (mut feed, cap) = risk_feed::new_for_testing(sc.ctx());
        let clock = clock::create_for_testing(sc.ctx());
        risk_feed::publish_bonded(&mut feed, key(), 1000, 60_000_000000000, blob(), &clock, sc.ctx());
        teardown(sc, feed, cap, clock);
    }

    #[test]
    #[expected_failure(abort_code = risk_feed::EBondTooLow)]
    fun register_below_min_aborts() {
        let mut sc = ts::begin(ALICE);
        let (mut feed, cap) = risk_feed::new_for_testing(sc.ctx());
        risk_feed::register_publisher(&mut feed, b"Alice", sui_coin(1_000_000, sc.ctx()), sc.ctx());
        test_utils::destroy(feed);
        test_utils::destroy(cap);
        ts::end(sc);
    }

    #[test]
    #[expected_failure(abort_code = risk_feed::EChallengeBondTooLow)]
    fun dust_challenge_below_min_aborts() {
        let (mut sc, mut feed, cap, clock) = setup();
        sc.next_tx(BOB);
        // A 0.001 SUI dust bond can no longer freeze the market's reads.
        risk_feed::challenge(&mut feed, key(), sui_coin(1_000_000, sc.ctx()), sc.ctx());
        teardown(sc, feed, cap, clock);
    }

    #[test]
    #[expected_failure(abort_code = risk_feed::ESelfResolve)]
    fun self_resolve_aborts() {
        let (mut sc, mut feed, cap, clock) = setup();
        sc.next_tx(BOB);
        risk_feed::challenge(&mut feed, key(), sui_coin(100_000_000, sc.ctx()), sc.ctx());
        // Bob can't both open the challenge and rule on it in his own favor.
        risk_feed::resolve_challenge(&mut feed, &cap, key(), true, sc.ctx());
        teardown(sc, feed, cap, clock);
    }

    #[test]
    fun unstake_returns_funds() {
        let (mut sc, mut feed, cap, clock) = setup();
        // No open challenge → Alice can withdraw her residual stake.
        let c = risk_feed::unstake(&mut feed, sc.ctx());
        assert!(coin::value(&c) == 100_000_000, 0);
        assert!(risk_feed::stake_bond(&feed, ALICE) == 0, 1);
        coin::burn_for_testing(c);
        teardown(sc, feed, cap, clock);
    }

    #[test]
    #[expected_failure(abort_code = risk_feed::EOpenChallenge)]
    fun unstake_blocked_during_challenge() {
        let (mut sc, mut feed, cap, clock) = setup();
        sc.next_tx(BOB);
        risk_feed::challenge(&mut feed, key(), sui_coin(100_000_000, sc.ctx()), sc.ctx());
        sc.next_tx(ALICE);
        // A disputed publisher can't escape slashing by unstaking mid-challenge.
        let c = risk_feed::unstake(&mut feed, sc.ctx());
        coin::burn_for_testing(c);
        teardown(sc, feed, cap, clock);
    }

    #[test]
    fun legacy_publish_still_works() {
        // The capability path the live consumers + agent scripts use is unchanged.
        let mut sc = ts::begin(ALICE);
        let (mut feed, cap) = risk_feed::new_for_testing(sc.ctx());
        let clock = clock::create_for_testing(sc.ctx());
        risk_feed::publish(&mut feed, &cap, key(), 282, 60_000_000000000, blob(), &clock, sc.ctx());
        assert!(risk_feed::probability_bps(&feed, key()) == 282, 0);
        assert!(!risk_feed::is_challenged(&feed, key()), 1);
        teardown(sc, feed, cap, clock);
    }
}
