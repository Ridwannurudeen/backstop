#[test_only]
module lending_demo::lending_demo_tests {
    use std::string;
    use sui::clock;
    use sui::coin;
    use sui::balance;
    use std::unit_test;
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
    #[expected_failure(abort_code = cover_pool::ELegacyLaneDisabled)]
    fun insure_is_disabled_with_legacy_cover_pool() {
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

        unit_test::destroy(market);
        unit_test::destroy(lp);
        clock::destroy_for_testing(clock);
        unit_test::destroy(pool);
        unit_test::destroy(feed);
        unit_test::destroy(cap);
    }

    #[test]
    #[expected_failure(abort_code = lending_demo::ENotInsured)]
    fun cover_without_policy_aborts() {
        let mut ctx = tx_context::dummy();
        let (mut feed, cap) = risk_feed::new_for_testing(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);
        publish_prob(&mut feed, &cap, 800, &clock, &ctx);

        let mut pool = cover_pool::new_pool_for_testing<TESTCOIN>(
            string::utf8(MARKET), 3000, 10_000, &mut ctx,
        );
        let lp = cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        let mut market = lending_demo::new_for_testing<TESTCOIN>(string::utf8(MARKET), &mut ctx);
        lending_demo::cover_shortfall(&mut market, &mut pool, &feed, &clock, &mut ctx);

        unit_test::destroy(market);
        unit_test::destroy(lp);
        clock::destroy_for_testing(clock);
        unit_test::destroy(pool);
        unit_test::destroy(feed);
        unit_test::destroy(cap);
    }
}
