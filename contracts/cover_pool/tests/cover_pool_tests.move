#[test_only]
module cover_pool::cover_pool_tests {
    use std::string;
    use sui::clock;
    use sui::coin;
    use sui::balance;
    use sui::test_utils;
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

        // First LP anchors 1 share = 1 unit.
        let s1 = cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        assert!(cover_pool::shares(&s1) == 1000, 0);
        // Second LP deposits into a pool worth 1000 → 500 * 1000 / 1000 = 500 shares.
        let s2 = cover_pool::deposit_lp(&mut pool, fund(500, &mut ctx), &mut ctx);
        assert!(cover_pool::shares(&s2) == 500, 1);
        assert!(cover_pool::total_shares(&pool) == 1500, 2);
        assert!(cover_pool::pool_value(&pool) == 1500, 3);

        test_utils::destroy(s1);
        test_utils::destroy(s2);
        test_utils::destroy(pool);
    }

    #[test]
    fun premium_priced_off_feed() {
        let mut ctx = tx_context::dummy();
        let (mut feed, cap) = risk_feed::new_for_testing(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);
        publish_prob(&mut feed, &cap, 500, &clock, &ctx); // 5% implied

        let pool = new_pool(1000, 10_000, &mut ctx); // fair load
        // 1000 cover * 5% = 50.
        assert!(cover_pool::premium_for(&pool, &feed, 1000) == 50, 0);

        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
        test_utils::destroy(feed);
        test_utils::destroy(cap);
    }

    #[test]
    fun claim_pays_when_triggered() {
        let mut ctx = tx_context::dummy();
        let (mut feed, cap) = risk_feed::new_for_testing(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);
        publish_prob(&mut feed, &cap, 500, &clock, &ctx);

        let mut pool = new_pool(1000, 10_000, &mut ctx);
        let lp = cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        // Buy 500 cover; premium = 500 * 5% = 25.
        let policy = cover_pool::buy_cover(
            &mut pool, &feed, fund(25, &mut ctx), 500, 1000, &clock, &mut ctx,
        );
        assert!(cover_pool::total_cover(&pool) == 500, 0);
        assert!(cover_pool::pool_value(&pool) == 1025, 1);

        // Market crashes past the trigger.
        publish_prob(&mut feed, &cap, 1200, &clock, &ctx);
        let payout = cover_pool::claim(&mut pool, &feed, policy, &clock, &mut ctx);
        assert!(coin::value(&payout) == 500, 2);
        assert!(cover_pool::total_cover(&pool) == 0, 3);
        assert!(cover_pool::pool_value(&pool) == 525, 4); // 1025 - 500

        coin::burn_for_testing(payout);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
        test_utils::destroy(feed);
        test_utils::destroy(cap);
    }

    #[test]
    #[expected_failure(abort_code = cover_pool::ENotTriggered)]
    fun claim_aborts_below_trigger() {
        let mut ctx = tx_context::dummy();
        let (mut feed, cap) = risk_feed::new_for_testing(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);
        publish_prob(&mut feed, &cap, 500, &clock, &ctx);

        let mut pool = new_pool(1000, 10_000, &mut ctx);
        let lp = cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        let policy = cover_pool::buy_cover(
            &mut pool, &feed, fund(25, &mut ctx), 500, 1000, &clock, &mut ctx,
        );

        // Reading stays at 5%, below the 10% trigger → claim must abort.
        let payout = cover_pool::claim(&mut pool, &feed, policy, &clock, &mut ctx);

        coin::burn_for_testing(payout);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
        test_utils::destroy(feed);
        test_utils::destroy(cap);
    }

    #[test]
    #[expected_failure(abort_code = cover_pool::EInsolvent)]
    fun buy_blocked_when_undercollateralized() {
        let mut ctx = tx_context::dummy();
        let (mut feed, cap) = risk_feed::new_for_testing(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);
        publish_prob(&mut feed, &cap, 500, &clock, &ctx);

        let mut pool = new_pool(1000, 10_000, &mut ctx);
        // Only 100 of capital, but a buyer wants 1000 of cover → can't back it.
        let lp = cover_pool::deposit_lp(&mut pool, fund(100, &mut ctx), &mut ctx);
        let policy = cover_pool::buy_cover(
            &mut pool, &feed, fund(50, &mut ctx), 1000, 1000, &clock, &mut ctx,
        );

        test_utils::destroy(policy);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
        test_utils::destroy(feed);
        test_utils::destroy(cap);
    }

    #[test]
    fun lp_earns_premium_after_expiry() {
        let mut ctx = tx_context::dummy();
        let (mut feed, cap) = risk_feed::new_for_testing(&mut ctx);
        let mut clock = clock::create_for_testing(&mut ctx);
        publish_prob(&mut feed, &cap, 500, &clock, &ctx);

        let mut pool = new_pool(1000, 10_000, &mut ctx);
        let lp = cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        // Buyer pays 20 premium for 400 cover, expiring at t=1000.
        let policy = cover_pool::buy_cover(
            &mut pool, &feed, fund(20, &mut ctx), 400, 1000, &clock, &mut ctx,
        );
        // Withdrawing everything now is blocked — capital backs the live cover.
        // Let the policy expire untriggered and free the liability.
        clock::set_for_testing(&mut clock, 2000);
        cover_pool::expire_policy(&mut pool, policy, &clock);
        assert!(cover_pool::total_cover(&pool) == 0, 0);

        // LP now redeems full stake: original 1000 + the 20 earned premium.
        let out = cover_pool::withdraw_lp(&mut pool, lp, &mut ctx);
        assert!(coin::value(&out) == 1020, 1);
        assert!(cover_pool::pool_value(&pool) == 0, 2);

        coin::burn_for_testing(out);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
        test_utils::destroy(feed);
        test_utils::destroy(cap);
    }
}
