/// Backstop Calibration — an on-chain truth/accuracy ledger for a forecasting agent.
///
/// The agent records each probability-of-failure prediction (with a Walrus blob of
/// its evidence), then later settles it against the realized outcome. The ledger
/// keeps running accuracy and Brier score on-chain, so the agent's calibration is a
/// public, tamper-evident fact rather than a self-reported claim.
module accountability::calibration {
    use std::string::String;
    use sui::table::{Self, Table};
    use sui::clock::{Self, Clock};
    use sui::event;

    /// Probability must be expressed in basis points (<= 10_000).
    const EBadProb: u64 = 0;
    /// No prediction exists at the given id.
    const ENotFound: u64 = 1;
    /// Prediction has already been settled.
    const EAlreadySettled: u64 = 2;

    /// A single probability-of-failure prediction and its eventual outcome.
    public struct Prediction has store, copy, drop {
        market: String,
        prob_bps: u64,
        walrus_blob: String,
        ts_ms: u64,
        settled: bool,
        crashed: bool,
    }

    /// Shared ledger of all predictions plus running accuracy aggregates.
    public struct CalibrationLedger has key {
        id: UID,
        preds: Table<u64, Prediction>,
        next_id: u64,
        total: u64,
        settled: u64,
        hits: u64,
        /// Accumulated squared error in bps², scaled down by 10_000 per prediction.
        brier_sum: u64,
    }

    /// Authority to record and settle predictions on the ledger.
    public struct AdminCap has key, store {
        id: UID,
    }

    public struct PredictionRecorded has copy, drop {
        id: u64,
        market: String,
        prob_bps: u64,
    }

    public struct PredictionSettled has copy, drop {
        id: u64,
        crashed: bool,
        brier: u64,
        hit: bool,
    }

    fun init(ctx: &mut TxContext) {
        let ledger = CalibrationLedger {
            id: object::new(ctx),
            preds: table::new<u64, Prediction>(ctx),
            next_id: 0,
            total: 0,
            settled: 0,
            hits: 0,
            brier_sum: 0,
        };
        transfer::share_object(ledger);
        transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
    }

    /// Record a new probability-of-failure prediction; returns its id.
    public fun record_prediction(
        ledger: &mut CalibrationLedger,
        _cap: &AdminCap,
        market: String,
        prob_bps: u64,
        walrus_blob: String,
        clock: &Clock,
        _ctx: &TxContext,
    ): u64 {
        assert!(prob_bps <= 10_000, EBadProb);
        let id = ledger.next_id;
        let pred = Prediction {
            market,
            prob_bps,
            walrus_blob,
            ts_ms: clock::timestamp_ms(clock),
            settled: false,
            crashed: false,
        };
        table::add(&mut ledger.preds, id, pred);
        ledger.next_id = ledger.next_id + 1;
        ledger.total = ledger.total + 1;
        event::emit(PredictionRecorded { id, market: pred.market, prob_bps });
        id
    }

    /// Settle a prediction against the realized outcome, updating accuracy/Brier.
    public fun settle_prediction(
        ledger: &mut CalibrationLedger,
        _cap: &AdminCap,
        id: u64,
        crashed: bool,
        _clock: &Clock,
    ) {
        assert!(table::contains(&ledger.preds, id), ENotFound);
        let pred = table::borrow_mut(&mut ledger.preds, id);
        assert!(!pred.settled, EAlreadySettled);

        let outcome_bps = if (crashed) 10_000 else 0;
        let diff = if (pred.prob_bps >= outcome_bps) {
            pred.prob_bps - outcome_bps
        } else {
            outcome_bps - pred.prob_bps
        };
        let brier = (diff * diff) / 10_000;
        let hit = (pred.prob_bps >= 5_000) == crashed;

        pred.settled = true;
        pred.crashed = crashed;

        ledger.settled = ledger.settled + 1;
        ledger.brier_sum = ledger.brier_sum + brier;
        if (hit) ledger.hits = ledger.hits + 1;

        event::emit(PredictionSettled { id, crashed, brier, hit });
    }

    // --- Views ---

    public fun total(l: &CalibrationLedger): u64 { l.total }
    public fun settled(l: &CalibrationLedger): u64 { l.settled }

    public fun accuracy_bps(l: &CalibrationLedger): u64 {
        if (l.settled == 0) 0 else l.hits * 10_000 / l.settled
    }

    public fun brier_avg(l: &CalibrationLedger): u64 {
        if (l.settled == 0) 0 else l.brier_sum / l.settled
    }

    public fun pred_prob_bps(p: &Prediction): u64 { p.prob_bps }
    public fun pred_settled(p: &Prediction): bool { p.settled }
    public fun pred_crashed(p: &Prediction): bool { p.crashed }
    public fun pred_market(p: &Prediction): String { p.market }

    public fun ledger_id(l: &CalibrationLedger): ID { object::id(l) }

    #[test_only]
    public fun new_for_testing(ctx: &mut TxContext): (CalibrationLedger, AdminCap) {
        let ledger = CalibrationLedger {
            id: object::new(ctx),
            preds: table::new<u64, Prediction>(ctx),
            next_id: 0,
            total: 0,
            settled: 0,
            hits: 0,
            brier_sum: 0,
        };
        (ledger, AdminCap { id: object::new(ctx) })
    }
}
