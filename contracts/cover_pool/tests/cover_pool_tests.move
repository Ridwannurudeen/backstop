#[test_only]
module cover_pool::cover_pool_tests {
    use std::string;
    use std::unit_test;
    use sui::clock;
    use sui::coin;
    use sui::balance;
    use risk_feed::risk_feed::{Self, RiskFeed, PublisherCap};
    use cover_pool::cover_pool::{Self, CoverPool};

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

    fun new_pool(trigger_bps: u64, loading_bps: u64, ctx: &mut TxContext): CoverPool<TESTCOIN> {
        cover_pool::new_pool_for_testing<TESTCOIN>(string::utf8(MARKET), trigger_bps, loading_bps, ctx)
    }

    #[test]
    fun lp_shares_minted_pro_rata() {
        let mut ctx = tx_context::dummy();
        let mut pool = new_pool(1000, 10_000, &mut ctx);

        let s1 = cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        let s2 = cover_pool::deposit_lp(&mut pool, fund(500, &mut ctx), &mut ctx);
        assert!(cover_pool::shares(&s1) == 1000, 0);
        assert!(cover_pool::shares(&s2) == 500, 1);
        assert!(cover_pool::total_shares(&pool) == 1500, 2);
        assert!(cover_pool::pool_value(&pool) == 1500, 3);

        unit_test::destroy(s1);
        unit_test::destroy(s2);
        unit_test::destroy(pool);
    }

    #[test]
    fun premium_read_still_works_for_research_quotes() {
        let mut ctx = tx_context::dummy();
        let (mut feed, cap) = risk_feed::new_for_testing(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);
        publish_prob(&mut feed, &cap, 500, &clock, &ctx);

        let pool = new_pool(1000, 10_000, &mut ctx);
        assert!(cover_pool::premium_for(&pool, &feed, 1000) == 50, 0);

        clock::destroy_for_testing(clock);
        unit_test::destroy(pool);
        unit_test::destroy(feed);
        unit_test::destroy(cap);
    }

    #[test]
    #[expected_failure(abort_code = cover_pool::ELegacyLaneDisabled)]
    fun buy_cover_is_disabled() {
        let mut ctx = tx_context::dummy();
        let (mut feed, cap) = risk_feed::new_for_testing(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);
        publish_prob(&mut feed, &cap, 500, &clock, &ctx);

        let mut pool = new_pool(1000, 10_000, &mut ctx);
        let lp = cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        let policy = cover_pool::buy_cover(
            &mut pool, &feed, fund(25, &mut ctx), 500, 1000, &clock, &mut ctx,
        );

        unit_test::destroy(policy);
        unit_test::destroy(lp);
        clock::destroy_for_testing(clock);
        unit_test::destroy(pool);
        unit_test::destroy(feed);
        unit_test::destroy(cap);
    }

    #[test]
    #[expected_failure(abort_code = cover_pool::ELegacyLaneDisabled)]
    fun claim_fresh_is_disabled() {
        let mut ctx = tx_context::dummy();
        let (mut feed, cap) = risk_feed::new_for_testing(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);
        publish_prob(&mut feed, &cap, 500, &clock, &ctx);

        let mut pool = new_pool(1000, 10_000, &mut ctx);
        let policy = cover_pool::policy_for_testing(&pool, 500, 1000, &mut ctx);
        let payout = cover_pool::claim_fresh(&mut pool, &feed, policy, &clock, 1000, &mut ctx);

        coin::burn_for_testing(payout);
        clock::destroy_for_testing(clock);
        unit_test::destroy(pool);
        unit_test::destroy(feed);
        unit_test::destroy(cap);
    }
}
