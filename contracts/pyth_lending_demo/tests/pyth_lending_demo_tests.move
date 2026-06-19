#[test_only]
module pyth_lending_demo::pyth_lending_demo_tests {
    use std::string;
    use std::unit_test;
    use sui::clock;
    use sui::coin;
    use sui::balance;
    use sui::sui::SUI;
    use pyth_cover_pool::pyth_cover_pool;
    use pyth_lending_demo::pyth_lending_demo;

    // suiUSDe/USD at expo -8: $1.00 = 100_000_000, depeg floor $0.97.
    const FEED: vector<u8> = b"SUIUSDE/USD";
    const EXPO_MAG: u64 = 8;
    const THRESHOLD: u64 = 97_000_000; // $0.97
    const PEG: u64 = 100_000_000;      // $1.00
    const DEPEG: u64 = 95_000_000;     // $0.95
    const PREMIUM_BPS: u64 = 200;      // 2% base rate (0% utilization)
    const SURGE_BPS: u64 = 800;        // +8% at 100% utilization
    const TREASURY_FEE_BPS: u64 = 500; // 5% protocol fee on paid premiums
    const KEEPER_BOUNTY: u64 = 2;
    const MAX_AGE: u64 = 60;
    const MAX_CONF_BPS: u64 = 200;
    const DWELL_SECS: u64 = 10;     // a breach must persist 10s before it latches
    const ACT_SECS: u64 = 5;        // cover is not claimable until 5s after purchase
    const MAX_TERM_SECS: u64 = 2_592_000; // 30 days
    const TIMELOCK_SECS: u64 = 3_600;
    const ARM_MS: u64 = 5_000;      // arm at activation (t=0 buy)
    const CONFIRM_MS: u64 = 15_000; // ARM_MS + DWELL_SECS*1000
    const EXPIRY: u64 = 2_592_000_000; // 30 days, matching MAX_TERM_SECS
    const ASSET: vector<u8> = b"suiUSDe reserve";

    fun fund(amount: u64, ctx: &mut TxContext): coin::Coin<SUI> {
        coin::from_balance(balance::create_for_testing<SUI>(amount), ctx)
    }

    fun new_pool(ctx: &mut TxContext): pyth_cover_pool::DepegCoverPool<SUI> {
        pyth_cover_pool::new_pool_for_testing<SUI>(
            FEED, true, EXPO_MAG, THRESHOLD, MAX_AGE, PREMIUM_BPS, SURGE_BPS,
            MAX_CONF_BPS, DWELL_SECS, ACT_SECS, MAX_TERM_SECS, 0, 0, TIMELOCK_SECS, TREASURY_FEE_BPS,
            KEEPER_BOUNTY, ctx,
        )
    }

    #[test]
    fun backstop_covers_depeg_shortfall() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);

        // Pool insuring suiUSDe below $0.97, funded with 1000 SUI.
        let mut pool = new_pool(&mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        // Lending market buys 500 of depeg cover; premium = 500 * 2% = 10.
        let mut market = pyth_lending_demo::new_for_testing(string::utf8(ASSET), &mut ctx);
        let premium = pyth_cover_pool::premium_for(&pool, 500);
        pyth_lending_demo::insure_at_price_for_testing(
            &mut market, &mut pool, fund(premium, &mut ctx), 500, EXPIRY, PEG, &clock, &mut ctx,
        );
        assert!(pyth_lending_demo::is_insured(&market), 0);
        assert!(pyth_lending_demo::reserve_value(&market) == 0, 1);

        // suiUSDe depegs to $0.95 — after activation a keeper arms the breach, then
        // confirms a dwell later, once the depeg has persisted.
        clock::set_for_testing(&mut clock, ARM_MS);
        pyth_lending_demo::record_shortfall_at_price_for_testing(
            &mut market, &mut pool, DEPEG, &clock, &mut ctx,
        );
        clock::set_for_testing(&mut clock, CONFIRM_MS);
        pyth_lending_demo::record_shortfall_at_price_for_testing(
            &mut market, &mut pool, DEPEG, &clock, &mut ctx,
        );

        // The backstop claims the latched payout into the reserve.
        pyth_lending_demo::cover_shortfall(&mut market, &mut pool, &mut ctx);
        assert!(pyth_lending_demo::reserve_value(&market) == 500, 2);
        assert!(!pyth_lending_demo::is_insured(&market), 3);

        unit_test::destroy(market);
        unit_test::destroy(lp);
        clock::destroy_for_testing(clock);
        unit_test::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_lending_demo::EAlreadyInsured)]
    fun double_insure_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(&mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        let mut market = pyth_lending_demo::new_for_testing(string::utf8(ASSET), &mut ctx);
        let premium = pyth_cover_pool::premium_for(&pool, 500);
        pyth_lending_demo::insure_at_price_for_testing(
            &mut market, &mut pool, fund(premium, &mut ctx), 500, EXPIRY, PEG, &clock, &mut ctx,
        );
        // Second insure on an already-insured market must abort.
        let premium2 = pyth_cover_pool::premium_for(&pool, 500);
        pyth_lending_demo::insure_at_price_for_testing(
            &mut market, &mut pool, fund(premium2, &mut ctx), 500, EXPIRY, PEG, &clock, &mut ctx,
        );

        unit_test::destroy(market);
        unit_test::destroy(lp);
        clock::destroy_for_testing(clock);
        unit_test::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_lending_demo::ENotInsured)]
    fun cover_without_policy_aborts() {
        let mut ctx = tx_context::dummy();
        let mut pool = new_pool(&mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        // No policy bought → claiming a shortfall must abort.
        let mut market = pyth_lending_demo::new_for_testing(string::utf8(ASSET), &mut ctx);
        pyth_lending_demo::cover_shortfall(&mut market, &mut pool, &mut ctx);

        unit_test::destroy(market);
        unit_test::destroy(lp);
        unit_test::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_cover_pool::ENotBreached)]
    fun claim_without_breach_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(&mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        let mut market = pyth_lending_demo::new_for_testing(string::utf8(ASSET), &mut ctx);
        let premium = pyth_cover_pool::premium_for(&pool, 500);
        pyth_lending_demo::insure_at_price_for_testing(
            &mut market, &mut pool, fund(premium, &mut ctx), 500, EXPIRY, PEG, &clock, &mut ctx,
        );
        // Insured but never breached → the latched claim must abort, no free payout.
        pyth_lending_demo::cover_shortfall(&mut market, &mut pool, &mut ctx);

        unit_test::destroy(market);
        unit_test::destroy(lp);
        clock::destroy_for_testing(clock);
        unit_test::destroy(pool);
    }
}
