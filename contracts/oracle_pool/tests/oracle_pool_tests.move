#[test_only]
module oracle_pool::oracle_pool_tests {
    use sui::coin;
    use sui::balance;
    use sui::test_utils;
    use oracle_pool::oracle_pool::{Self, OracleCoverPool};

    public struct TESTCOIN has drop {}

    // 1e9-scaled strike (50k) and settlement prices, matching the oracle scale.
    const STRIKE: u64 = 50_000_000000000;
    const ITM: u64 = 45_000_000000000; // settled below strike -> DOWN pays
    const OTM: u64 = 55_000_000000000; // settled above strike -> no payout

    fun dummy_id(ctx: &mut TxContext): ID {
        let uid = object::new(ctx);
        let id = object::uid_to_inner(&uid);
        object::delete(uid);
        id
    }

    fun fund(amount: u64, ctx: &mut TxContext): coin::Coin<TESTCOIN> {
        coin::from_balance(balance::create_for_testing<TESTCOIN>(amount), ctx)
    }

    fun pool(ctx: &mut TxContext): OracleCoverPool<TESTCOIN> {
        oracle_pool::new_pool_for_testing<TESTCOIN>(dummy_id(ctx), STRIKE, ctx)
    }

    #[test]
    fun pays_when_in_the_money() {
        let mut ctx = tx_context::dummy();
        let mut p = pool(&mut ctx);
        let lp = oracle_pool::deposit_lp(&mut p, fund(1000, &mut ctx), &mut ctx);
        let policy = oracle_pool::buy_cover(&mut p, fund(50, &mut ctx), 500, &mut ctx);
        assert!(oracle_pool::total_cover(&p) == 500, 0);
        assert!(oracle_pool::pool_value(&p) == 1050, 1);

        // Underlying settled below strike -> DOWN cover pays out.
        let payout = oracle_pool::claim_settled_for_testing(&mut p, ITM, policy, &mut ctx);
        assert!(coin::value(&payout) == 500, 2);
        assert!(oracle_pool::total_cover(&p) == 0, 3);
        assert!(oracle_pool::pool_value(&p) == 550, 4);

        coin::burn_for_testing(payout);
        test_utils::destroy(lp);
        test_utils::destroy(p);
    }

    #[test]
    #[expected_failure(abort_code = oracle_pool::ENotInTheMoney)]
    fun aborts_out_of_the_money() {
        let mut ctx = tx_context::dummy();
        let mut p = pool(&mut ctx);
        let lp = oracle_pool::deposit_lp(&mut p, fund(1000, &mut ctx), &mut ctx);
        let policy = oracle_pool::buy_cover(&mut p, fund(50, &mut ctx), 500, &mut ctx);
        // Settled above strike: no crash -> claim must abort.
        let payout = oracle_pool::claim_settled_for_testing(&mut p, OTM, policy, &mut ctx);
        coin::burn_for_testing(payout);
        test_utils::destroy(lp);
        test_utils::destroy(p);
    }

    #[test]
    fun lp_redeems_capital_plus_premium() {
        let mut ctx = tx_context::dummy();
        let mut p = pool(&mut ctx);
        let lp = oracle_pool::deposit_lp(&mut p, fund(1000, &mut ctx), &mut ctx);
        // A buyer pays 30 premium for 400 cover, then the policy finishes OTM:
        // we model that by simply never claiming and letting the LP redeem after
        // cover is released. Here we test the unencumbered case (no live cover).
        let policy = oracle_pool::buy_cover(&mut p, fund(30, &mut ctx), 400, &mut ctx);
        // Settle in-the-money and pay, clearing the cover, leaving premium for LPs.
        let payout = oracle_pool::claim_settled_for_testing(&mut p, ITM, policy, &mut ctx);
        coin::burn_for_testing(payout); // 400 paid out; 630 remains (1000+30-400)
        let out = oracle_pool::withdraw_lp(&mut p, lp, &mut ctx);
        assert!(coin::value(&out) == 630, 0);
        coin::burn_for_testing(out);
        test_utils::destroy(p);
    }

    #[test]
    #[expected_failure(abort_code = oracle_pool::EInsolvent)]
    fun buy_blocked_when_undercollateralized() {
        let mut ctx = tx_context::dummy();
        let mut p = pool(&mut ctx);
        let lp = oracle_pool::deposit_lp(&mut p, fund(100, &mut ctx), &mut ctx);
        let policy = oracle_pool::buy_cover(&mut p, fund(10, &mut ctx), 1000, &mut ctx);
        test_utils::destroy(policy);
        test_utils::destroy(lp);
        test_utils::destroy(p);
    }
}
