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

    public struct USDC has drop {}

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

    fun fund_usdc(amount: u64, ctx: &mut TxContext): coin::Coin<USDC> {
        coin::from_balance(balance::create_for_testing<USDC>(amount), ctx)
    }

    fun new_pool_for<T>(ctx: &mut TxContext): pyth_cover_pool::DepegCoverPool<T> {
        pyth_cover_pool::new_pool_for_testing<T>(
            FEED, true, EXPO_MAG, THRESHOLD, MAX_AGE, PREMIUM_BPS, SURGE_BPS,
            MAX_CONF_BPS, DWELL_SECS, ACT_SECS, MAX_TERM_SECS, 0, 0, TIMELOCK_SECS, TREASURY_FEE_BPS,
            KEEPER_BOUNTY, ctx,
        )
    }

    fun new_pool(ctx: &mut TxContext): pyth_cover_pool::DepegCoverPool<SUI> {
        new_pool_for<SUI>(ctx)
    }

    fun install_buyer_cap(
        market: &mut pyth_lending_demo::LendingMarket<SUI>,
        pool: &pyth_cover_pool::DepegCoverPool<SUI>,
        ctx: &mut TxContext,
    ) {
        let cap = pyth_cover_pool::new_buyer_cap_for_testing(pool, ctx);
        pyth_lending_demo::install_buyer_cap(market, cap);
    }

    #[test]
    fun backstop_covers_depeg_shortfall() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);

        // Pool insuring suiUSDe below $0.97, funded with 1000 SUI.
        let mut pool = new_pool(&mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        // Lending market buys 500 of depeg cover; premium = 500 * 2% = 10.
        let mut market = pyth_lending_demo::new_for_testing<SUI>(string::utf8(ASSET), &mut ctx);
        install_buyer_cap(&mut market, &pool, &mut ctx);
        assert!(pyth_lending_demo::has_buyer_cap(&market), 4);
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

        let mut market = pyth_lending_demo::new_for_testing<SUI>(string::utf8(ASSET), &mut ctx);
        install_buyer_cap(&mut market, &pool, &mut ctx);
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
    fun stable_collateral_market_flow() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);

        let mut pool = new_pool_for<USDC>(&mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund_usdc(1000, &mut ctx), &mut ctx);

        let mut market = pyth_lending_demo::new_for_testing<USDC>(string::utf8(ASSET), &mut ctx);
        let cap = pyth_cover_pool::new_buyer_cap_for_testing(&pool, &mut ctx);
        pyth_lending_demo::install_buyer_cap(&mut market, cap);
        let premium = pyth_cover_pool::premium_for(&pool, 500);
        pyth_lending_demo::insure_at_price_for_testing(
            &mut market, &mut pool, fund_usdc(premium, &mut ctx), 500, EXPIRY, PEG, &clock, &mut ctx,
        );

        clock::set_for_testing(&mut clock, ARM_MS);
        pyth_lending_demo::record_shortfall_at_price_for_testing(
            &mut market, &mut pool, DEPEG, &clock, &mut ctx,
        );
        clock::set_for_testing(&mut clock, CONFIRM_MS);
        pyth_lending_demo::record_shortfall_at_price_for_testing(
            &mut market, &mut pool, DEPEG, &clock, &mut ctx,
        );

        pyth_lending_demo::cover_shortfall(&mut market, &mut pool, &mut ctx);
        assert!(pyth_lending_demo::reserve_value(&market) == 500, 0);

        unit_test::destroy(market);
        unit_test::destroy(lp);
        clock::destroy_for_testing(clock);
        unit_test::destroy(pool);
    }

    #[test]
    #[expected_failure(abort_code = pyth_lending_demo::ENoBuyerCap)]
    fun insure_without_buyer_cap_aborts() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(&mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        let mut market = pyth_lending_demo::new_for_testing<SUI>(string::utf8(ASSET), &mut ctx);
        let premium = pyth_cover_pool::premium_for(&pool, 500);
        pyth_lending_demo::insure_at_price_for_testing(
            &mut market, &mut pool, fund(premium, &mut ctx), 500, EXPIRY, PEG, &clock, &mut ctx,
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
        let mut market = pyth_lending_demo::new_for_testing<SUI>(string::utf8(ASSET), &mut ctx);
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

        let mut market = pyth_lending_demo::new_for_testing<SUI>(string::utf8(ASSET), &mut ctx);
        install_buyer_cap(&mut market, &pool, &mut ctx);
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

    // M3: after a policy expires un-breached the market can release it and insure again
    // (previously the expired policy was trapped and the market bricked permanently).
    #[test]
    fun market_reinsures_after_policy_expiry() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut pool = new_pool(&mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        let mut market = pyth_lending_demo::new_for_testing<SUI>(string::utf8(ASSET), &mut ctx);
        install_buyer_cap(&mut market, &pool, &mut ctx);
        let premium = pyth_cover_pool::premium_for(&pool, 500);
        pyth_lending_demo::insure_at_price_for_testing(
            &mut market, &mut pool, fund(premium, &mut ctx), 500, EXPIRY, PEG, &clock, &mut ctx,
        );
        assert!(pyth_lending_demo::is_insured(&market), 0);

        // Policy expires without a depeg → release it, freeing the market + pool liability.
        clock::set_for_testing(&mut clock, EXPIRY + 1);
        pyth_lending_demo::release_expired_policy(&mut market, &mut pool, &clock);
        assert!(!pyth_lending_demo::is_insured(&market), 1);
        assert!(pyth_cover_pool::total_cover(&pool) == 0, 2);

        // The market can now buy fresh cover (a new 30-day term from now).
        let next_expiry = EXPIRY + 1 + EXPIRY;
        let premium2 = pyth_cover_pool::premium_for(&pool, 500);
        pyth_lending_demo::insure_at_price_for_testing(
            &mut market, &mut pool, fund(premium2, &mut ctx), 500, next_expiry, PEG, &clock, &mut ctx,
        );
        assert!(pyth_lending_demo::is_insured(&market), 3);

        unit_test::destroy(market);
        unit_test::destroy(lp);
        clock::destroy_for_testing(clock);
        unit_test::destroy(pool);
    }

    // M5: reserve capital can be withdrawn by the market cap holder (was permanently locked).
    #[test]
    fun withdraw_reserve_returns_capital() {
        let mut ctx = tx_context::dummy();
        let mut market = pyth_lending_demo::new_for_testing<SUI>(string::utf8(ASSET), &mut ctx);
        let cap = pyth_lending_demo::new_market_cap_for_testing(&market, &mut ctx);
        pyth_lending_demo::deposit_reserve(&mut market, fund(777, &mut ctx));
        assert!(pyth_lending_demo::reserve_value(&market) == 777, 0);

        let out = pyth_lending_demo::withdraw_reserve(&mut market, &cap, 777, &mut ctx);
        assert!(coin::value(&out) == 777, 1);
        assert!(pyth_lending_demo::reserve_value(&market) == 0, 2);

        coin::burn_for_testing(out);
        unit_test::destroy(cap);
        unit_test::destroy(market);
    }

    // M5: a cap minted for another market cannot withdraw this market's reserve.
    #[test]
    #[expected_failure(abort_code = pyth_lending_demo::EWrongMarketCap)]
    fun withdraw_reserve_wrong_cap_rejected() {
        let mut ctx = tx_context::dummy();
        let mut market_a = pyth_lending_demo::new_for_testing<SUI>(string::utf8(ASSET), &mut ctx);
        let market_b = pyth_lending_demo::new_for_testing<SUI>(string::utf8(ASSET), &mut ctx);
        let cap_b = pyth_lending_demo::new_market_cap_for_testing(&market_b, &mut ctx);
        pyth_lending_demo::deposit_reserve(&mut market_a, fund(100, &mut ctx));

        let out = pyth_lending_demo::withdraw_reserve(&mut market_a, &cap_b, 100, &mut ctx); // aborts
        coin::burn_for_testing(out);
        unit_test::destroy(cap_b);
        unit_test::destroy(market_a);
        unit_test::destroy(market_b);
    }
}
