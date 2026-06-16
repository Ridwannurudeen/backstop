#[test_only]
module pyth_lending_demo::pyth_lending_demo_tests {
    use std::string;
    use sui::clock;
    use sui::coin;
    use sui::balance;
    use sui::sui::SUI;
    use sui::test_utils;
    use pyth_cover_pool::pyth_cover_pool;
    use pyth_lending_demo::pyth_lending_demo;

    // suiUSDe/USD at expo -8: $1.00 = 100_000_000, depeg floor $0.97.
    const FEED: vector<u8> = b"SUIUSDE/USD";
    const EXPO_MAG: u64 = 8;
    const THRESHOLD: u64 = 97_000_000; // $0.97
    const PEG: u64 = 100_000_000;      // $1.00
    const DEPEG: u64 = 95_000_000;     // $0.95
    const PREMIUM_BPS: u64 = 200;      // 2% per term
    const MAX_AGE: u64 = 60;
    const MAX_CONF_BPS: u64 = 200;
    const ASSET: vector<u8> = b"suiUSDe reserve";

    fun fund(amount: u64, ctx: &mut TxContext): coin::Coin<SUI> {
        coin::from_balance(balance::create_for_testing<SUI>(amount), ctx)
    }

    fun new_pool(ctx: &mut TxContext): pyth_cover_pool::DepegCoverPool<SUI> {
        pyth_cover_pool::new_pool_for_testing<SUI>(
            FEED, true, EXPO_MAG, THRESHOLD, MAX_AGE, PREMIUM_BPS, MAX_CONF_BPS, ctx,
        )
    }

    #[test]
    fun backstop_covers_depeg_shortfall() {
        let mut ctx = tx_context::dummy();
        let clock = clock::create_for_testing(&mut ctx);

        // Pool insuring suiUSDe below $0.97, funded with 1000 SUI.
        let mut pool = new_pool(&mut ctx);
        let lp = pyth_cover_pool::deposit_lp(&mut pool, fund(1000, &mut ctx), &mut ctx);

        // Lending market buys 500 of depeg cover; premium = 500 * 2% = 10.
        let mut market = pyth_lending_demo::new_for_testing(string::utf8(ASSET), &mut ctx);
        let premium = pyth_cover_pool::premium_for(&pool, 500);
        pyth_lending_demo::insure(
            &mut market, &mut pool, fund(premium, &mut ctx), 500, 1000, &clock, &mut ctx,
        );
        assert!(pyth_lending_demo::is_insured(&market), 0);
        assert!(pyth_lending_demo::reserve_value(&market) == 0, 1);

        // suiUSDe depegs to $0.95 — a keeper latches the breach during the dip.
        pyth_lending_demo::record_shortfall_at_price_for_testing(
            &mut market, &pool, DEPEG, &clock,
        );

        // The backstop claims the latched payout into the reserve.
        pyth_lending_demo::cover_shortfall(&mut market, &mut pool, &mut ctx);
        assert!(pyth_lending_demo::reserve_value(&market) == 500, 2);
        assert!(!pyth_lending_demo::is_insured(&market), 3);

        test_utils::destroy(market);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
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
        pyth_lending_demo::insure(
            &mut market, &mut pool, fund(premium, &mut ctx), 500, 1000, &clock, &mut ctx,
        );
        // Second insure on an already-insured market must abort.
        let premium2 = pyth_cover_pool::premium_for(&pool, 500);
        pyth_lending_demo::insure(
            &mut market, &mut pool, fund(premium2, &mut ctx), 500, 1000, &clock, &mut ctx,
        );

        test_utils::destroy(market);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
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

        test_utils::destroy(market);
        test_utils::destroy(lp);
        test_utils::destroy(pool);
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
        pyth_lending_demo::insure(
            &mut market, &mut pool, fund(premium, &mut ctx), 500, 1000, &clock, &mut ctx,
        );
        // Insured but never breached → the latched claim must abort, no free payout.
        pyth_lending_demo::cover_shortfall(&mut market, &mut pool, &mut ctx);

        test_utils::destroy(market);
        test_utils::destroy(lp);
        clock::destroy_for_testing(clock);
        test_utils::destroy(pool);
    }
}
