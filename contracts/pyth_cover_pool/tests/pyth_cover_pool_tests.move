#[test_only]
module pyth_cover_pool::pyth_cover_pool_tests {
    use sui::clock;
    use sui::coin;
    use sui::balance;
    use sui::test_utils;
    use pyth_cover_pool::pyth_cover_pool::{Self, DepegCoverPool};

    public struct TESTCOIN has drop {}

    // A stablecoin feed at expo -8: $1.00 = 100_000_000, depeg floor $0.97.
    const FEED: vector<u8> = b"SUIUSDE/USD";
    const EXPO_MAG: u64 = 8;
    const THRESHOLD: u64 = 97_000_000; // $0.97
    const PEG: u64 = 100_000_000;      // $1.00
    const DEPEG: u64 = 95_000_000;     // $0.95
    const PREMIUM_BPS: u64 = 200;      // 2% per term
    const MAX_AGE: u64 = 60;

    fun fund(amount: u64, ctx: &mut TxContext): coin::Coin<TESTCOIN> {
        coin::from_balance(balance::create_for_testing<TESTCOIN>(amount), ctx)
    }

    fun new_pool(premium_bps: u64, ctx: &mut TxContext): DepegCoverPool<TESTCOIN> {
        pyth_cover_pool::new_pool_for_testing<TESTCOIN>(
            FEED, true, EXPO_MAG, THRESHOLD, MAX_AGE, premium_bps, ctx,
        )
    }

    #[test]
    fun lp_shares_minted_pro_rata() {
        let mut ctx = tx_context::dummy();
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);

        // First LP anchors 1 share = 1 unit.
        let s1 = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        assert!(pyth_cover_pool::shares(&s1) == 1000, 0);
        // Second LP into a pool worth 1000 → 500 * 1000 / 1000 = 500 shares.
        let s2 = pyth_cover_pool::deposit_lp(&mut pool, fund(500, &mut ctx), &mut ctx);
        assert!(pyth_cover_pool::shares(&s2) == 500, 1);
        assert!(pyth_cover_pool::total_shares(&pool) == 1500, 2);
        assert!(pyth_cover_pool::pool_value(&pool) == 1500, 3);

        test_utils::destroy(s1);
        test_utils::destroy(s2);
        test_utils::destroy(pool);
    }

    #[test]
    fun premium_priced_flat() {
        let mut ctx = tx_context::dummy();
        let pool = new_pool(PREMIUM_BPS, &mut ctx);
        // 1000 cover * 2% = 20.
        assert!(pyth_cover_pool::premium_for(&pool, 1000) == 20, 0);
        test_utils::destroy(pool);
    }

    #[test]
    fun claim_pays_when_depegged() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        // Buy 500 cover; premium = 500 * 2% = 10.
        let policy = pyth_cover_pool::buy_cover(
            &mut pool, fund(10, &mut ctx), 500, 1000, &clock, &mut ctx,
        );
        assert!(pyth_cover_pool::total_cover(&pool) == 500, 0);
        assert!(pyth_cover_pool::pool_value(&pool) == 1010, 1);

        // Pyth reports $0.95 — at/below the $0.97 floor → payout.
        let payout = pyth_cover_pool::claim_at_price_for_testing(
            &mut pool, DEPEG, policy, &clock, &mut ctx,
        );
        assert!(coin::value(&payout) == 500, 2);
        assert!(pyth_cover_pool::total_cover(&pool) == 0, 3);
        assert!(pyth_cover_pool::pool_value(&pool) == 510, 4); // 1010 - 500

        coin::burn_for_testing(payout);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::ENotDepegged)]
    fun claim_aborts_above_threshold() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        let policy = pyth_cover_pool::buy_cover(
            &mut pool, fund(10, &mut ctx), 500, 1000, &clock, &mut ctx,
        );

        // Still pegged at $1.00 → above the $0.97 floor → claim must abort.
        let payout = pyth_cover_pool::claim_at_price_for_testing(
            &mut pool, PEG, policy, &clock, &mut ctx,
        );

        coin::burn_for_testing(payout);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::EPolicyExpired)]
    fun claim_aborts_after_expiry() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        let policy = pyth_cover_pool::buy_cover(
            &mut pool, fund(10, &mut ctx), 500, 1000, &clock, &mut ctx,
        );

        // Depegged, but the policy already expired → claim must abort.
        clock::set_for_testing(&mut clock, 2000);
        let payout = pyth_cover_pool::claim_at_price_for_testing(
            &mut pool, DEPEG, policy, &clock, &mut ctx,
        );

        coin::burn_for_testing(payout);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::EInsolvent)]
    fun buy_blocked_when_undercollateralized() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        // Only 100 of capital, but a buyer wants 1000 of cover → can't back it.
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(100, &mut ctx), &mut ctx);
        let policy = pyth_cover_pool::buy_cover(
            &mut pool, fund(20, &mut ctx), 1000, 1000, &clock, &mut ctx,
        );

        test_utils::destroy(policy);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::EZeroPremium)]
    fun dust_cover_rejected() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        // 0.1% rate: 50 cover * 10 / 10_000 = 0 premium → reject free cover.
        let mut pool = new_pool(10, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        let policy = pyth_cover_pool::buy_cover(
            &mut pool, fund(1, &mut ctx), 50, 1000, &clock, &mut ctx,
        );

        test_utils::destroy(policy);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    fun lp_earns_premium_after_expiry() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        // Buyer pays 8 premium for 400 cover, expiring at t=1000.
        let policy = pyth_cover_pool::buy_cover(
            &mut pool, fund(8, &mut ctx), 400, 1000, &clock, &mut ctx,
        );
        // No depeg; let it expire and free the liability.
        clock::set_for_testing(&mut clock, 2000);
        pyth_cover_pool::expire_policy(&mut pool, policy, &clock);
        assert!(pyth_cover_pool::total_cover(&pool) == 0, 0);

        // LP redeems full stake: original 1000 + the 8 earned premium.
        let out = pyth_cover_pool::withdraw_lp(&mut pool, lp, &mut ctx);
        assert!(coin::value(&out) == 1008, 1);
        assert!(pyth_cover_pool::pool_value(&pool) == 0, 2);

        coin::burn_for_testing(out);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }
}
