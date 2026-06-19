#[test_only]
module risk_guard::risk_guard_tests {
    use std::string;
    use sui::clock;
    use sui::coin;
    use sui::balance;
    use sui::sui::SUI;
    use sui::test_utils;
    use sui::test_scenario;
    use risk_feed::risk_feed;
    use risk_guard::risk_guard;

    public struct TESTCOIN has drop {}

    fun fund_coin(amount: u64, ctx: &mut TxContext): coin::Coin<TESTCOIN> {
        coin::from_balance(balance::create_for_testing<TESTCOIN>(amount), ctx)
    }

    fun fund_sui(amount: u64, ctx: &mut TxContext): coin::Coin<SUI> {
        coin::mint_for_testing<SUI>(amount, ctx)
    }

    #[test]
    fun withdraw_allowed_when_market_calm() {
        let mut ctx = tx_context::dummy();
        let (mut feed, cap) = risk_feed::new_for_testing(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);
        // 200 bps = 2% implied crash probability — well under the 5% tolerance.
        risk_feed::publish(
            &mut feed, &cap, string::utf8(b"BTC"),
            200, 60_000_000000000, string::utf8(b"blob"), &clock, &ctx,
        );

        let mut t = risk_guard::new_treasury<TESTCOIN>(string::utf8(b"BTC"), 500, &mut ctx);
        risk_guard::deposit(&mut t, fund_coin(1000, &mut ctx));

        assert!(risk_guard::is_safe(&t, &feed), 0);
        assert!(risk_guard::headroom_bps(&t, &feed) == 300, 1);

        let c = risk_guard::withdraw(&mut t, &feed, 400, &mut ctx);
        assert!(coin::value(&c) == 400, 2);
        assert!(risk_guard::value(&t) == 600, 3);

        coin::burn_for_testing(c);
        clock::destroy_for_testing(clock);
        test_utils::destroy(t);
        test_utils::destroy(feed);
        test_utils::destroy(cap);
    }

    #[test]
    #[expected_failure(abort_code = risk_guard::ECrashRiskTooHigh)]
    fun withdraw_frozen_when_crash_risk_high() {
        let mut ctx = tx_context::dummy();
        let (mut feed, cap) = risk_feed::new_for_testing(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);
        // 1200 bps = 12% — above the 5% tolerance, so withdrawals freeze.
        risk_feed::publish(
            &mut feed, &cap, string::utf8(b"BTC"),
            1200, 60_000_000000000, string::utf8(b"blob"), &clock, &ctx,
        );

        let mut t = risk_guard::new_treasury<TESTCOIN>(string::utf8(b"BTC"), 500, &mut ctx);
        risk_guard::deposit(&mut t, fund_coin(1000, &mut ctx));
        assert!(!risk_guard::is_safe(&t, &feed), 0);

        let c = risk_guard::withdraw(&mut t, &feed, 400, &mut ctx); // aborts here

        coin::burn_for_testing(c);
        clock::destroy_for_testing(clock);
        test_utils::destroy(t);
        test_utils::destroy(feed);
        test_utils::destroy(cap);
    }

    #[test]
    #[expected_failure(abort_code = risk_guard::ECrashRiskTooHigh)]
    fun withdraw_frozen_when_feed_is_challenged() {
        let mut ctx = tx_context::dummy();
        let (mut feed, cap) = risk_feed::new_for_testing(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);
        risk_feed::publish(
            &mut feed, &cap, string::utf8(b"BTC"),
            200, 60_000_000000000, string::utf8(b"blob"), &clock, &ctx,
        );
        risk_feed::challenge(&mut feed, string::utf8(b"BTC"), fund_sui(100_000_000, &mut ctx), &ctx);

        let mut t = risk_guard::new_treasury<TESTCOIN>(string::utf8(b"BTC"), 500, &mut ctx);
        risk_guard::deposit(&mut t, fund_coin(1000, &mut ctx));
        assert!(!risk_guard::is_safe(&t, &feed), 0);
        assert!(risk_guard::headroom_bps(&t, &feed) == 0, 1);

        let c = risk_guard::withdraw(&mut t, &feed, 400, &mut ctx);

        coin::burn_for_testing(c);
        clock::destroy_for_testing(clock);
        test_utils::destroy(t);
        test_utils::destroy(feed);
        test_utils::destroy(cap);
    }

    // A non-owner cannot drain the shared treasury even while the market is calm.
    #[test]
    #[expected_failure(abort_code = risk_guard::ENotOwner)]
    fun non_owner_withdraw_aborts() {
        let owner = @0xA;
        let attacker = @0xB;
        let mut sc = test_scenario::begin(owner);
        let (mut feed, cap) = risk_feed::new_for_testing(sc.ctx());
        let clock = clock::create_for_testing(sc.ctx());
        risk_feed::publish(
            &mut feed, &cap, string::utf8(b"BTC"),
            200, 60_000_000000000, string::utf8(b"blob"), &clock, sc.ctx(),
        );
        let mut t = risk_guard::new_treasury<TESTCOIN>(string::utf8(b"BTC"), 500, sc.ctx());
        risk_guard::deposit(&mut t, fund_coin(1000, sc.ctx()));

        // A different sender attempts the withdrawal.
        sc.next_tx(attacker);
        let c = risk_guard::withdraw(&mut t, &feed, 400, sc.ctx()); // aborts ENotOwner

        coin::burn_for_testing(c);
        clock::destroy_for_testing(clock);
        test_utils::destroy(t);
        test_utils::destroy(feed);
        test_utils::destroy(cap);
        sc.end();
    }
}
