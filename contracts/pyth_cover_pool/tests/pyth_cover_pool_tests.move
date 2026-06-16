#[test_only]
module pyth_cover_pool::pyth_cover_pool_tests {
    use sui::clock::{Self, Clock};
    use sui::coin;
    use sui::balance;
    use sui::test_utils;
    use pyth_cover_pool::pyth_cover_pool::{Self, DepegCoverPool, Policy};

    public struct TESTCOIN has drop {}

    // A stablecoin feed at expo -8: $1.00 = 100_000_000, depeg floor $0.97.
    const FEED: vector<u8> = b"SUIUSDE/USD";
    const EXPO_MAG: u64 = 8;
    const THRESHOLD: u64 = 97_000_000; // $0.97
    const PEG: u64 = 100_000_000;      // $1.00
    const DEPEG: u64 = 95_000_000;     // $0.95
    const PREMIUM_BPS: u64 = 200;      // 2% base rate (0% utilization)
    const SURGE_BPS: u64 = 800;        // +8% at 100% utilization
    const MAX_AGE: u64 = 60;
    const MAX_CONF_BPS: u64 = 200;     // reject reads with conf/price > 2%
    const CONF: u64 = 1_000_000;       // a $0.01 confidence band
    const DWELL_SECS: u64 = 10;        // a breach must persist 10s before it latches
    const ACT_SECS: u64 = 5;           // cover is not claimable until 5s after purchase
    const ACT_MS: u64 = 5_000;         // ACT_SECS in ms (first claimable instant)
    const ARM_MS: u64 = ACT_MS;        // arm at activation (t=0 buy)
    const CONFIRM_MS: u64 = 15_000;    // ARM_MS + DWELL_SECS*1000
    const EXPIRY: u64 = 1_000_000;     // far beyond activation + dwell

    fun fund(amount: u64, ctx: &mut TxContext): coin::Coin<TESTCOIN> {
        coin::from_balance(balance::create_for_testing<TESTCOIN>(amount), ctx)
    }

    fun new_pool(premium_bps: u64, ctx: &mut TxContext): DepegCoverPool<TESTCOIN> {
        pyth_cover_pool::new_pool_for_testing<TESTCOIN>(
            FEED, true, EXPO_MAG, THRESHOLD, MAX_AGE, premium_bps, SURGE_BPS,
            MAX_CONF_BPS, DWELL_SECS, ACT_SECS, ctx,
        )
    }

    /// Buy `cover` paying exactly the pool's utilization-priced premium.
    fun buy(
        pool: &mut DepegCoverPool<TESTCOIN>,
        cover: u64,
        expiry: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Policy<TESTCOIN> {
        let premium = pyth_cover_pool::premium_for(pool, cover);
        pyth_cover_pool::buy_cover(pool, fund(premium, ctx), cover, expiry, clock, ctx)
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
    fun premium_priced_by_utilization() {
        let mut ctx = tx_context::dummy();
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        // 500 cover into a 1000 pool → 50% utilization.
        // rate = 200 + 800 * 0.5 = 600 bps; premium = 500 * 6% = 30.
        assert!(pyth_cover_pool::premium_rate_bps(&pool, 500) == 600, 0);
        assert!(pyth_cover_pool::premium_for(&pool, 500) == 30, 1);

        // 1000 cover → 100% utilization → ceiling rate = 200 + 800 = 1000 bps; 1000*10%.
        assert!(pyth_cover_pool::premium_rate_bps(&pool, 1000) == 1000, 2);
        assert!(pyth_cover_pool::premium_for(&pool, 1000) == 100, 3);

        test_utils::destroy(lp);
        test_utils::destroy(pool);
    }

    #[test]
    fun dwell_latch_pays_when_depegged() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        // Buy 500 cover at t=0 at the utilization-priced premium. Activation = t+5s.
        let premium = pyth_cover_pool::premium_for(&pool, 500);
        let mut policy = pyth_cover_pool::buy_cover(
            &mut pool, fund(premium, &mut ctx), 500, EXPIRY, &clock, &mut ctx,
        );
        assert!(pyth_cover_pool::total_cover(&pool) == 500, 0);
        assert!(pyth_cover_pool::pool_value(&pool) == 1000 + premium, 1);
        assert!(pyth_cover_pool::policy_activation_ms(&policy) == ACT_MS, 2);

        // Arm only once the activation delay has elapsed.
        clock::set_for_testing(&mut clock, ARM_MS);
        pyth_cover_pool::latch_at_price_for_testing(&pool, &mut policy, DEPEG, 0, &clock);
        assert!(pyth_cover_pool::policy_armed(&policy), 3);
        assert!(!pyth_cover_pool::policy_breached(&policy), 4);

        // Confirm a full dwell later → latched.
        clock::set_for_testing(&mut clock, CONFIRM_MS);
        pyth_cover_pool::latch_at_price_for_testing(&pool, &mut policy, DEPEG, 0, &clock);
        assert!(pyth_cover_pool::policy_breached(&policy), 5);

        let payout = pyth_cover_pool::claim_latched(&mut pool, policy, &mut ctx);
        assert!(coin::value(&payout) == 500, 6);
        assert!(pyth_cover_pool::total_cover(&pool) == 0, 7);
        assert!(pyth_cover_pool::pool_value(&pool) == 1000 + premium - 500, 8);

        coin::burn_for_testing(payout);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::ENotActive)]
    fun latch_blocked_before_activation() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        let mut policy = buy(&mut pool, 500, EXPIRY, &clock, &mut ctx);

        // Depegged immediately at t=0, but the activation delay has not elapsed →
        // cover bought at the instant of a depeg cannot arm.
        pyth_cover_pool::latch_at_price_for_testing(&pool, &mut policy, DEPEG, 0, &clock);

        test_utils::destroy(policy);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::EExpiryBeforeActivation)]
    fun buy_aborts_when_expiry_before_activation() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        // Expiry (3000) is before activation (5000) → a never-claimable policy.
        let policy = buy(&mut pool, 500, 3000, &clock, &mut ctx);

        test_utils::destroy(policy);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::ENotBreached)]
    fun arm_only_is_not_claimable() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        let mut policy = buy(&mut pool, 500, EXPIRY, &clock, &mut ctx);

        // A single (arming) observation is not a sustained breach → cannot claim.
        clock::set_for_testing(&mut clock, ARM_MS);
        pyth_cover_pool::latch_at_price_for_testing(&pool, &mut policy, DEPEG, 0, &clock);
        assert!(pyth_cover_pool::policy_armed(&policy), 0);
        let payout = pyth_cover_pool::claim_latched(&mut pool, policy, &mut ctx);

        coin::burn_for_testing(payout);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::ENotBreached)]
    fun confirm_inside_dwell_window_is_noop() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        let mut policy = buy(&mut pool, 500, EXPIRY, &clock, &mut ctx);

        // Arm at activation, then "confirm" one ms too early → no latch.
        clock::set_for_testing(&mut clock, ARM_MS);
        pyth_cover_pool::latch_at_price_for_testing(&pool, &mut policy, DEPEG, 0, &clock);
        clock::set_for_testing(&mut clock, CONFIRM_MS - 1);
        pyth_cover_pool::latch_at_price_for_testing(&pool, &mut policy, DEPEG, 0, &clock);
        assert!(!pyth_cover_pool::policy_breached(&policy), 0);

        // Still not latched → the claim must abort.
        let payout = pyth_cover_pool::claim_latched(&mut pool, policy, &mut ctx);

        coin::burn_for_testing(payout);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::ENotDepegged)]
    fun latch_aborts_when_not_depegged() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        let mut policy = buy(&mut pool, 500, EXPIRY, &clock, &mut ctx);

        // Active, but pegged price → nothing to arm.
        clock::set_for_testing(&mut clock, ARM_MS);
        pyth_cover_pool::latch_at_price_for_testing(&pool, &mut policy, PEG, 0, &clock);

        test_utils::destroy(policy);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::EPolicyExpired)]
    fun latch_aborts_after_expiry() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        // Expiry 8000 is past activation (5000) so the buy is valid.
        let mut policy = buy(&mut pool, 500, 8000, &clock, &mut ctx);

        // Depegged, but the policy already expired → arming must abort.
        clock::set_for_testing(&mut clock, 9000);
        pyth_cover_pool::latch_at_price_for_testing(&pool, &mut policy, DEPEG, 0, &clock);

        test_utils::destroy(policy);
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
        let policy = buy(&mut pool, 1000, EXPIRY, &clock, &mut ctx);

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
        // 0.1% base into a 1000 pool: 50 cover → ~0.14% rate → premium rounds to 0.
        let mut pool = new_pool(10, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        let policy = buy(&mut pool, 50, EXPIRY, &clock, &mut ctx);

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

        // Buyer pays the utilization premium for 400 cover, expiring at t=8000.
        let premium = pyth_cover_pool::premium_for(&pool, 400);
        let policy = pyth_cover_pool::buy_cover(
            &mut pool, fund(premium, &mut ctx), 400, 8000, &clock, &mut ctx,
        );
        // No depeg; let it expire and free the liability.
        clock::set_for_testing(&mut clock, 9000);
        pyth_cover_pool::expire_policy(&mut pool, policy, &clock);
        assert!(pyth_cover_pool::total_cover(&pool) == 0, 0);

        // LP redeems full stake: original 1000 + the earned premium.
        let out = pyth_cover_pool::withdraw_lp(&mut pool, lp, &mut ctx);
        assert!(coin::value(&out) == 1000 + premium, 1);
        assert!(pyth_cover_pool::pool_value(&pool) == 0, 2);

        coin::burn_for_testing(out);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    fun latch_then_claim_after_expiry_and_recovery() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        let mut policy = buy(&mut pool, 500, EXPIRY, &clock, &mut ctx);

        // Keeper arms the breach after activation, then confirms a dwell later.
        clock::set_for_testing(&mut clock, ARM_MS);
        pyth_cover_pool::latch_at_price_for_testing(&pool, &mut policy, DEPEG, 0, &clock);
        clock::set_for_testing(&mut clock, CONFIRM_MS);
        pyth_cover_pool::latch_at_price_for_testing(&pool, &mut policy, DEPEG, 0, &clock);
        assert!(pyth_cover_pool::policy_breached(&policy), 0);

        // Price recovers AND the policy expires — the latched claim still pays.
        clock::set_for_testing(&mut clock, EXPIRY + 1);
        let payout = pyth_cover_pool::claim_latched(&mut pool, policy, &mut ctx);
        assert!(coin::value(&payout) == 500, 1);
        assert!(pyth_cover_pool::total_cover(&pool) == 0, 2);

        coin::burn_for_testing(payout);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::ENotBreached)]
    fun claim_latched_aborts_if_never_breached() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        let policy = buy(&mut pool, 500, EXPIRY, &clock, &mut ctx);

        let payout = pyth_cover_pool::claim_latched(&mut pool, policy, &mut ctx);

        coin::burn_for_testing(payout);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::EBreachedCannotExpire)]
    fun cannot_expire_latched_policy() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        let mut policy = buy(&mut pool, 500, EXPIRY, &clock, &mut ctx);
        clock::set_for_testing(&mut clock, ARM_MS);
        pyth_cover_pool::latch_at_price_for_testing(&pool, &mut policy, DEPEG, 0, &clock);
        clock::set_for_testing(&mut clock, CONFIRM_MS);
        pyth_cover_pool::latch_at_price_for_testing(&pool, &mut policy, DEPEG, 0, &clock);

        // A latched policy is claimable, so the LP can't expire it away.
        clock::set_for_testing(&mut clock, EXPIRY + 1);
        pyth_cover_pool::expire_policy(&mut pool, policy, &clock);

        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    fun latch_pays_with_tight_confidence() {
        // $0.95 spot + $0.01 band = $0.96, still at/below the $0.97 floor → pays.
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        let mut policy = buy(&mut pool, 500, EXPIRY, &clock, &mut ctx);
        clock::set_for_testing(&mut clock, ARM_MS);
        pyth_cover_pool::latch_at_price_for_testing(&pool, &mut policy, DEPEG, CONF, &clock);
        clock::set_for_testing(&mut clock, CONFIRM_MS);
        pyth_cover_pool::latch_at_price_for_testing(&pool, &mut policy, DEPEG, CONF, &clock);
        let payout = pyth_cover_pool::claim_latched(&mut pool, policy, &mut ctx);
        assert!(coin::value(&payout) == 500, 0);
        coin::burn_for_testing(payout);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::ENotDepegged)]
    fun latch_blocked_when_confidence_straddles_floor() {
        // $0.95 spot but a wide $0.025 band → upper edge $0.975 is above the $0.97
        // floor → must not arm (a noisy tick can't begin a breach).
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        let mut policy = buy(&mut pool, 500, EXPIRY, &clock, &mut ctx);
        clock::set_for_testing(&mut clock, ARM_MS);
        pyth_cover_pool::latch_at_price_for_testing(&pool, &mut policy, DEPEG, 2_500_000, &clock);
        test_utils::destroy(policy);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }
}
