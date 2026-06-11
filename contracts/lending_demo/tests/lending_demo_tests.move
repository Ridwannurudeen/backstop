#[test_only]
module lending_demo::lending_demo_tests {
    use std::string;
    use sui::clock;
    use sui::coin;
    use sui::balance;
    use sui::test_utils;
    use risk_feed::risk_feed::{Self, RiskFeed, PublisherCap};
    use cover_pool::cover_pool;
    use lending_demo::lending_demo;

    public struct TESTCOIN has drop {}

    const MARKET: vector<u8> = b"BTC";

    fun fund(amount: u64, ctx: &mut TxContext): coin::Coin<TESTCOIN> {
        coin::from_balance(balance::create_for_testing<TESTCOIN>(amount), ctx)
    }

    fun publish_prob(feed: &mut RiskFeed, cap: &PublisherCap, prob_bps: u64, clock: &clock::Clock, ctx: &TxContext) {
        risk_feed::publish(
            feed, cap, string::utf8(MARKET),
            prob_bps, 60_000_000000000, string::utf8(b"blob"), clock, ctx,
        );
    }

    #[test]
    fun backstop_covers_bad_debt() {
        let mut ctx = tx_context::dummy();
        let (mut feed, cap) = risk_feed::new_for_testing(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        // Calm reading: 8% implied probability of failure.
        publish_prob(&mut feed, &cap, 800, &clock, &ctx);

        // Pool: trigger at 30%, fair load, funded with 1000.
        let mut pool = cover_pool::new_pool_for_testing<TESTCOIN>(
            string::utf8(MARKET), 3000, 10_000, &mut ctx,
        );
        let lp = cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        // Lending market buys 500 of crash cover.
        let mut market = lending_demo::new_for_testing<TESTCOIN>(string::utf8(MARKET), &mut ctx);
        let premium = cover_pool::premium_for(&pool, &feed, 500);
        lending_demo::insure(
            &mut market, &mut pool, &feed, fund(premium, &mut ctx), 500, 1000, &clock, &mut ctx,
        );
        assert!(lending_demo::is_insured(&market), 0);
        assert!(lending_demo::reserve_value(&market) == 0, 1);

        // Market crashes past the 30% trigger.
        publish_prob(&mut feed, &cap, 6000, &clock, &ctx);

        // The backstop claims the payout into the reserve.
        lending_demo::cover_shortfall(&mut market, &mut pool, &feed, &clock, &mut ctx);
        assert!(lending_demo::reserve_value(&market) == 500, 2);
        assert!(!lending_demo::is_insured(&market), 3);

        test_utils::destroy(market);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
        test_utils::destroy(feed);
        test_utils::destroy(cap);
    }

    #[test]
    #[expected_failure(abort_code = lending_demo::EAlreadyInsured)]
    fun double_insure_aborts() {
        let mut ctx = tx_context::dummy();
        let (mut feed, cap) = risk_feed::new_for_testing(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);
        publish_prob(&mut feed, &cap, 800, &clock, &ctx);

        let mut pool = cover_pool::new_pool_for_testing<TESTCOIN>(
            string::utf8(MARKET), 3000, 10_000, &mut ctx,
        );
        let lp = cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        let mut market = lending_demo::new_for_testing<TESTCOIN>(string::utf8(MARKET), &mut ctx);
        let premium = cover_pool::premium_for(&pool, &feed, 500);
        lending_demo::insure(
            &mut market, &mut pool, &feed, fund(premium, &mut ctx), 500, 1000, &clock, &mut ctx,
        );
        // Second insure on an already-insured market must abort.
        let premium2 = cover_pool::premium_for(&pool, &feed, 500);
        lending_demo::insure(
            &mut market, &mut pool, &feed, fund(premium2, &mut ctx), 500, 1000, &clock, &mut ctx,
        );

        test_utils::destroy(market);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
        test_utils::destroy(feed);
        test_utils::destroy(cap);
    }
}
