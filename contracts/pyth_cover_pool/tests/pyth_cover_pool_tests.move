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
    const TREASURY_FEE_BPS: u64 = 500; // 5% protocol fee on paid premiums
    const K_TREASURY_FEE_BPS: u8 = 9;
    const BPS: u128 = 10_000;
    const MAX_AGE: u64 = 60;
    const MAX_CONF_BPS: u64 = 200;     // reject reads with conf/price > 2%
    const CONF: u64 = 1_000_000;       // a $0.01 confidence band
    const DWELL_SECS: u64 = 10;        // a breach must persist 10s before it latches
    const ACT_SECS: u64 = 5;           // cover is not claimable until 5s after purchase
    const ACT_MS: u64 = 5_000;         // ACT_SECS in ms (first claimable instant)
    const TIMELOCK_SECS: u64 = 100;    // governance delay on parameter updates
    const ARM_MS: u64 = ACT_MS;        // arm at activation (t=0 buy)
    const CONFIRM_MS: u64 = 15_000;    // ARM_MS + DWELL_SECS*1000
    const EXPIRY: u64 = 1_000_000;     // far beyond activation + dwell

    fun fund(amount: u64, ctx: &mut TxContext): coin::Coin<TESTCOIN> {
        coin::from_balance(balance::create_for_testing<TESTCOIN>(amount), ctx)
    }

    fun treasury_fee(paid: u64): u64 {
        (((paid as u128) * (TREASURY_FEE_BPS as u128)) / BPS) as u64
    }

    fun new_pool(premium_bps: u64, ctx: &mut TxContext): DepegCoverPool<TESTCOIN> {
        pyth_cover_pool::new_pool_for_testing<TESTCOIN>(
            FEED, true, EXPO_MAG, THRESHOLD, MAX_AGE, premium_bps, SURGE_BPS,
            MAX_CONF_BPS, DWELL_SECS, ACT_SECS, 0, 0, TIMELOCK_SECS,
            TREASURY_FEE_BPS, ctx,
        )
    }

    fun new_pool_capped(
        max_cover_per_policy: u64,
        max_total_cover: u64,
        ctx: &mut TxContext,
    ): DepegCoverPool<TESTCOIN> {
        pyth_cover_pool::new_pool_for_testing<TESTCOIN>(
            FEED, true, EXPO_MAG, THRESHOLD, MAX_AGE, PREMIUM_BPS, SURGE_BPS,
            MAX_CONF_BPS, DWELL_SECS, ACT_SECS, max_cover_per_policy, max_total_cover,
            TIMELOCK_SECS, TREASURY_FEE_BPS, ctx,
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
    fun treasury_fee_skimmed_and_lp_earns_net_premium() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        let premium = pyth_cover_pool::premium_for(&pool, 500);
        let fee = treasury_fee(premium);
        let policy = pyth_cover_pool::buy_cover(
            &mut pool, fund(premium, &mut ctx), 500, 8000, &clock, &mut ctx,
        );
        assert!(pyth_cover_pool::treasury_fee_bps(&pool) == TREASURY_FEE_BPS, 0);
        assert!(pyth_cover_pool::treasury_value(&pool) == fee, 1);
        assert!(pyth_cover_pool::pool_value(&pool) == 1000 + premium - fee, 2);

        clock::set_for_testing(&mut clock, 9000);
        pyth_cover_pool::expire_policy(&mut pool, policy, &clock);
        let out = pyth_cover_pool::withdraw_lp(&mut pool, lp, &mut ctx);
        assert!(coin::value(&out) == 1000 + premium - fee, 3);

        coin::burn_for_testing(out);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    fun admin_withdraws_treasury_without_touching_lp_funds() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let cap = pyth_cover_pool::new_admin_cap_for_testing(&pool, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        let premium = pyth_cover_pool::premium_for(&pool, 500);
        let fee = treasury_fee(premium);
        let policy = pyth_cover_pool::buy_cover(
            &mut pool, fund(premium, &mut ctx), 500, EXPIRY, &clock, &mut ctx,
        );
        let out = pyth_cover_pool::withdraw_treasury(&mut pool, &cap, fee, &mut ctx);
        assert!(coin::value(&out) == fee, 0);
        assert!(pyth_cover_pool::treasury_value(&pool) == 0, 1);
        assert!(pyth_cover_pool::pool_value(&pool) == 1000 + premium - fee, 2);

        coin::burn_for_testing(out);
        test_utils::destroy(policy);
        test_utils::destroy(lp);
        test_utils::destroy(cap);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::EWrongAdminCap)]
    fun wrong_admin_cap_rejected_for_treasury_withdrawal() {
        let mut ctx = tx_context::dummy();
        let poola = new_pool(PREMIUM_BPS, &mut ctx);
        let mut poolb = new_pool(PREMIUM_BPS, &mut ctx);
        let cap_a = pyth_cover_pool::new_admin_cap_for_testing(&poola, &mut ctx);
        let out = pyth_cover_pool::withdraw_treasury(&mut poolb, &cap_a, 1, &mut ctx);

        coin::burn_for_testing(out);
        test_utils::destroy(cap_a);
        test_utils::destroy(poola);
        test_utils::destroy(poolb);
    }

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::EInsolvent)]
    fun buy_rechecks_collateralization_after_treasury_fee_skim() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(900, &mut ctx), &mut ctx);
        let policy = buy(&mut pool, 1000, EXPIRY, &clock, &mut ctx);

        test_utils::destroy(policy);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
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
        let fee = treasury_fee(premium);
        let mut policy = pyth_cover_pool::buy_cover(
            &mut pool, fund(premium, &mut ctx), 500, EXPIRY, &clock, &mut ctx,
        );
        assert!(pyth_cover_pool::total_cover(&pool) == 500, 0);
        assert!(pyth_cover_pool::pool_value(&pool) == 1000 + premium - fee, 1);
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
        assert!(pyth_cover_pool::pool_value(&pool) == 1000 + premium - fee - 500, 8);

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
        let fee = treasury_fee(premium);
        let policy = pyth_cover_pool::buy_cover(
            &mut pool, fund(premium, &mut ctx), 400, 8000, &clock, &mut ctx,
        );
        // No depeg; let it expire and free the liability.
        clock::set_for_testing(&mut clock, 9000);
        pyth_cover_pool::expire_policy(&mut pool, policy, &clock);
        assert!(pyth_cover_pool::total_cover(&pool) == 0, 0);

        // LP redeems full stake: original 1000 + the earned net premium.
        let out = pyth_cover_pool::withdraw_lp(&mut pool, lp, &mut ctx);
        assert!(coin::value(&out) == 1000 + premium - fee, 1);
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

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::EPolicyCoverCap)]
    fun buy_blocked_above_per_policy_cap() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        // Per-policy cap 400; no pool cap.
        let mut pool = new_pool_capped(400, 0, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        let policy = buy(&mut pool, 500, EXPIRY, &clock, &mut ctx);

        test_utils::destroy(policy);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::EPoolCoverCap)]
    fun buy_blocked_above_pool_cap() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        // Aggregate cap 600; first 400 is fine, a second 300 (total 700) breaches it.
        let mut pool = new_pool_capped(0, 600, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        let p1 = buy(&mut pool, 400, EXPIRY, &clock, &mut ctx);
        let p2 = buy(&mut pool, 300, EXPIRY, &clock, &mut ctx);

        test_utils::destroy(p1);
        test_utils::destroy(p2);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    fun buys_within_caps_ok() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        // Per-policy 400, aggregate 600 — two 300-cover policies fit exactly.
        let mut pool = new_pool_capped(400, 600, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        let p1 = buy(&mut pool, 300, EXPIRY, &clock, &mut ctx);
        let p2 = buy(&mut pool, 300, EXPIRY, &clock, &mut ctx);
        assert!(pyth_cover_pool::total_cover(&pool) == 600, 0);

        test_utils::destroy(p1);
        test_utils::destroy(p2);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    // --- Governance ---

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::EPaused)]
    fun paused_blocks_buy() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let cap = pyth_cover_pool::new_admin_cap_for_testing(&pool, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        pyth_cover_pool::set_paused(&mut pool, &cap, true);
        assert!(pyth_cover_pool::is_paused(&pool), 0);
        let policy = buy(&mut pool, 500, EXPIRY, &clock, &mut ctx);

        test_utils::destroy(policy);
        test_utils::destroy(lp);
        test_utils::destroy(cap);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    fun claim_works_while_paused() {
        // The key safety property: a guardian pause never blocks payouts.
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let cap = pyth_cover_pool::new_admin_cap_for_testing(&pool, &mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);
        let mut policy = buy(&mut pool, 500, EXPIRY, &clock, &mut ctx);

        clock::set_for_testing(&mut clock, ARM_MS);
        pyth_cover_pool::latch_at_price_for_testing(&pool, &mut policy, DEPEG, 0, &clock);
        clock::set_for_testing(&mut clock, CONFIRM_MS);
        pyth_cover_pool::latch_at_price_for_testing(&pool, &mut policy, DEPEG, 0, &clock);

        // Pause the pool, then claim anyway — settlement is pause-exempt.
        pyth_cover_pool::set_paused(&mut pool, &cap, true);
        let payout = pyth_cover_pool::claim_latched(&mut pool, policy, &mut ctx);
        assert!(coin::value(&payout) == 500, 0);

        coin::burn_for_testing(payout);
        test_utils::destroy(lp);
        test_utils::destroy(cap);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::ETimelockNotElapsed)]
    fun param_update_blocked_before_timelock() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let cap = pyth_cover_pool::new_admin_cap_for_testing(&pool, &mut ctx);

        // Propose lowering the threshold; executing immediately must abort.
        pyth_cover_pool::propose_param_update(&mut pool, &cap, 0, 90_000_000, &clock);
        assert!(pyth_cover_pool::has_pending_update(&pool), 0);
        pyth_cover_pool::execute_param_update(&mut pool, &cap, &clock);

        test_utils::destroy(cap);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    fun param_update_executes_after_timelock() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let cap = pyth_cover_pool::new_admin_cap_for_testing(&pool, &mut ctx);

        pyth_cover_pool::propose_param_update(&mut pool, &cap, 0, 90_000_000, &clock);
        clock::set_for_testing(&mut clock, TIMELOCK_SECS * 1000);
        pyth_cover_pool::execute_param_update(&mut pool, &cap, &clock);
        assert!(pyth_cover_pool::threshold(&pool) == 90_000_000, 0);
        assert!(!pyth_cover_pool::has_pending_update(&pool), 1);

        test_utils::destroy(cap);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    fun treasury_fee_param_update_executes_after_timelock() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let cap = pyth_cover_pool::new_admin_cap_for_testing(&pool, &mut ctx);

        pyth_cover_pool::propose_param_update(
            &mut pool, &cap, K_TREASURY_FEE_BPS, 750, &clock,
        );
        clock::set_for_testing(&mut clock, TIMELOCK_SECS * 1000);
        pyth_cover_pool::execute_param_update(&mut pool, &cap, &clock);
        assert!(pyth_cover_pool::treasury_fee_bps(&pool) == 750, 0);

        test_utils::destroy(cap);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::ENoPendingUpdate)]
    fun cancelled_update_cannot_execute() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(PREMIUM_BPS, &mut ctx);
        let cap = pyth_cover_pool::new_admin_cap_for_testing(&pool, &mut ctx);

        pyth_cover_pool::propose_param_update(&mut pool, &cap, 1, 500, &clock);
        pyth_cover_pool::cancel_param_update(&mut pool, &cap);
        clock::set_for_testing(&mut clock, TIMELOCK_SECS * 1000);
        // Nothing pending → execute aborts.
        pyth_cover_pool::execute_param_update(&mut pool, &cap, &clock);

        test_utils::destroy(cap);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::EWrongAdminCap)]
    fun wrong_admin_cap_rejected() {
        let mut ctx = tx_context::dummy();
        let poola = new_pool(PREMIUM_BPS, &mut ctx);
        let mut poolb = new_pool(PREMIUM_BPS, &mut ctx);
        // A cap minted for pool A cannot govern pool B.
        let cap_a = pyth_cover_pool::new_admin_cap_for_testing(&poola, &mut ctx);
        pyth_cover_pool::set_paused(&mut poolb, &cap_a, true);

        test_utils::destroy(cap_a);
        test_utils::destroy(poola);
        test_utils::destroy(poolb);
    }
}
