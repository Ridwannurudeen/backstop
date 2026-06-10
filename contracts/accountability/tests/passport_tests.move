#[test_only]
module accountability::passport_tests {
    use std::string;
    use sui::clock;
    use sui::coin;
    use sui::balance;
    use sui::sui::SUI;
    use sui::test_utils;
    use accountability::calibration;
    use accountability::passport;

    fun sui_coin(amount: u64, ctx: &mut TxContext): coin::Coin<SUI> {
        coin::from_balance(balance::create_for_testing<SUI>(amount), ctx)
    }

    #[test]
    fun register_bond_decide_slash_reputation() {
        let mut ctx = tx_context::dummy();
        let (mut ledger, cap) = calibration::new_for_testing(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        // Seed the ledger with one correct settled prediction → accuracy 10000 bps.
        let id0 = calibration::record_prediction(
            &mut ledger, &cap, string::utf8(b"BTC"), 8_000, string::utf8(b"blob"), &clock, &ctx,
        );
        calibration::settle_prediction(&mut ledger, &cap, id0, true, &clock);

        let mut p = passport::new_for_testing(
            b"oracle-1", sui_coin(1_000, &mut ctx), &ledger, &clock, &mut ctx,
        );
        assert!(passport::bond_value(&p) == 1_000, 0);
        assert!(passport::decisions(&p) == 0, 1);
        assert!(passport::name(&p) == string::utf8(b"oracle-1"), 2);

        // Top up the bond.
        passport::top_up(&mut p, sui_coin(500, &mut ctx));
        assert!(passport::bond_value(&p) == 1_500, 3);

        // Cap-gated decision counter.
        passport::note_decision(&mut p, &cap);
        passport::note_decision(&mut p, &cap);
        assert!(passport::decisions(&p) == 2, 4);

        // Slash 400 → returns a coin, bond drops to 1100.
        let seized = passport::slash(&mut p, &cap, 400, &mut ctx);
        assert!(coin::value(&seized) == 400, 5);
        assert!(passport::bond_value(&p) == 1_100, 6);

        // Reputation reads ledger accuracy.
        assert!(passport::reputation_bps(&p, &ledger) == 10_000, 7);

        coin::burn_for_testing(seized);
        test_utils::destroy(p);
        clock::destroy_for_testing(clock);
        test_utils::destroy(ledger);
        test_utils::destroy(cap);
    }

    #[test]
    #[expected_failure(abort_code = passport::EInsufficientBond)]
    fun slash_over_bond_aborts() {
        let mut ctx = tx_context::dummy();
        let (ledger, cap) = calibration::new_for_testing(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        let mut p = passport::new_for_testing(
            b"oracle-1", sui_coin(100, &mut ctx), &ledger, &clock, &mut ctx,
        );
        let seized = passport::slash(&mut p, &cap, 101, &mut ctx);

        coin::burn_for_testing(seized);
        test_utils::destroy(p);
        clock::destroy_for_testing(clock);
        test_utils::destroy(ledger);
        test_utils::destroy(cap);
    }
}
