#[test_only]
module accountability::calibration_tests {
    use std::string;
    use sui::clock;
    use sui::test_utils;
    use accountability::calibration::{Self, CalibrationLedger, AdminCap};

    const MARKET: vector<u8> = b"BTC";

    fun record(
        ledger: &mut CalibrationLedger,
        cap: &AdminCap,
        prob_bps: u64,
        clock: &clock::Clock,
        ctx: &TxContext,
    ): u64 {
        calibration::record_prediction(
            ledger, cap, string::utf8(MARKET), prob_bps, string::utf8(b"blob"), clock, ctx,
        )
    }

    #[test]
    fun record_and_settle_updates_aggregates() {
        let mut ctx = tx_context::dummy();
        let (mut ledger, cap) = calibration::new_for_testing(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        // Predict 80% crash, then it crashes → hit, small Brier ((10000-8000)^2/10000 = 400).
        let id0 = record(&mut ledger, &cap, 8_000, &clock, &ctx);
        calibration::settle_prediction(&mut ledger, &cap, id0, true, &clock);

        // Predict 10% crash, then no crash → hit, small Brier (1000^2/10000 = 100).
        let id1 = record(&mut ledger, &cap, 1_000, &clock, &ctx);
        calibration::settle_prediction(&mut ledger, &cap, id1, false, &clock);

        assert!(calibration::total(&ledger) == 2, 0);
        assert!(calibration::settled(&ledger) == 2, 1);
        // Both predictions were on the correct side of 50% → perfect accuracy.
        assert!(calibration::accuracy_bps(&ledger) == 10_000, 2);
        // brier_avg = (400 + 100) / 2 = 250.
        assert!(calibration::brier_avg(&ledger) == 250, 3);

        clock::destroy_for_testing(clock);
        test_utils::destroy(ledger);
        test_utils::destroy(cap);
    }

    #[test]
    fun miss_lowers_accuracy() {
        let mut ctx = tx_context::dummy();
        let (mut ledger, cap) = calibration::new_for_testing(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        // Predict 90% crash but it does NOT crash → miss.
        let id0 = record(&mut ledger, &cap, 9_000, &clock, &ctx);
        calibration::settle_prediction(&mut ledger, &cap, id0, false, &clock);
        // Predict 10% crash and it does not crash → hit.
        let id1 = record(&mut ledger, &cap, 1_000, &clock, &ctx);
        calibration::settle_prediction(&mut ledger, &cap, id1, false, &clock);

        // 1 hit out of 2 settled → 5000 bps.
        assert!(calibration::accuracy_bps(&ledger) == 5_000, 0);

        clock::destroy_for_testing(clock);
        test_utils::destroy(ledger);
        test_utils::destroy(cap);
    }

    #[test]
    #[expected_failure(abort_code = calibration::EAlreadySettled)]
    fun double_settle_aborts() {
        let mut ctx = tx_context::dummy();
        let (mut ledger, cap) = calibration::new_for_testing(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        let id0 = record(&mut ledger, &cap, 6_000, &clock, &ctx);
        calibration::settle_prediction(&mut ledger, &cap, id0, true, &clock);
        calibration::settle_prediction(&mut ledger, &cap, id0, true, &clock);

        clock::destroy_for_testing(clock);
        test_utils::destroy(ledger);
        test_utils::destroy(cap);
    }

    #[test]
    #[expected_failure(abort_code = calibration::EBadProb)]
    fun bad_prob_aborts() {
        let mut ctx = tx_context::dummy();
        let (mut ledger, cap) = calibration::new_for_testing(&mut ctx);
        let clock = clock::create_for_testing(&mut ctx);

        record(&mut ledger, &cap, 10_001, &clock, &ctx);

        clock::destroy_for_testing(clock);
        test_utils::destroy(ledger);
        test_utils::destroy(cap);
    }
}
