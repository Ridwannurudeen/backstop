/// Backstop AgentPassport — a bonded, on-chain identity for a forecasting agent.
///
/// An agent registers a passport backed by a SUI bond and tied to a specific
/// CalibrationLedger. The bond is real skin in the game: it can be slashed by the
/// admin if the agent misbehaves, and the passport's reputation is read straight
/// from the ledger's settled accuracy — no self-reporting.
module accountability::passport {
    use std::string::{Self, String};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::sui::SUI;
    use sui::event;
    use accountability::calibration::{Self, CalibrationLedger};

    /// Slash amount exceeds the bond available.
    const EInsufficientBond: u64 = 0;
    /// Ledger supplied does not match the passport's bound ledger.
    const EWrongLedger: u64 = 1;
    /// Registration bond is below the minimum required.
    const EBondTooLow: u64 = 2;

    /// Minimum registration bond (0.1 SUI) — real skin in the game, matching the
    /// risk_feed / risk_index publisher bond scale.
    const MIN_BOND: u64 = 100_000_000;

    /// Shared, bonded identity for one agent, bound to one CalibrationLedger.
    public struct AgentPassport has key {
        id: UID,
        agent: address,
        name: String,
        bond: Balance<SUI>,
        /// Slashed collateral, locked here (no extractor) so the admin cannot profit
        /// from a slash — the penalty burns the agent's stake rather than paying it out.
        slashed: Balance<SUI>,
        ledger_id: ID,
        decisions: u64,
        created_ms: u64,
    }

    public struct PassportRegistered has copy, drop {
        passport: ID,
        agent: address,
        name: String,
        bond: u64,
    }

    public struct BondSlashed has copy, drop {
        passport: ID,
        amount: u64,
    }

    /// Register a bonded passport for the sender, bound to `ledger`.
    public fun register(
        name: vector<u8>,
        bond: Coin<SUI>,
        ledger: &CalibrationLedger,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let bond_value = coin::value(&bond);
        assert!(bond_value >= MIN_BOND, EBondTooLow);
        let passport = AgentPassport {
            id: object::new(ctx),
            agent: ctx.sender(),
            name: string::utf8(name),
            bond: coin::into_balance(bond),
            slashed: balance::zero<SUI>(),
            ledger_id: calibration::ledger_id(ledger),
            decisions: 0,
            created_ms: clock::timestamp_ms(clock),
        };
        event::emit(PassportRegistered {
            passport: object::id(&passport),
            agent: passport.agent,
            name: passport.name,
            bond: bond_value,
        });
        transfer::share_object(passport);
    }

    /// Note that the agent made an on-chain decision (admin-gated).
    public fun note_decision(p: &mut AgentPassport, _cap: &calibration::AdminCap) {
        p.decisions = p.decisions + 1;
    }

    /// Add more collateral to the bond.
    public fun top_up(p: &mut AgentPassport, c: Coin<SUI>) {
        balance::join(&mut p.bond, coin::into_balance(c));
    }

    /// Slash `amount` from the bond (admin-gated). The seized collateral is locked
    /// in the passport's `slashed` balance (no extractor) rather than paid out, so a
    /// slash burns the agent's stake and the admin gains nothing from it.
    public fun slash(
        p: &mut AgentPassport,
        _cap: &calibration::AdminCap,
        amount: u64,
    ) {
        assert!(amount <= balance::value(&p.bond), EInsufficientBond);
        balance::join(&mut p.slashed, balance::split(&mut p.bond, amount));
        event::emit(BondSlashed { passport: object::id(p), amount });
    }

    /// The agent's reputation, read as the bound ledger's settled accuracy in bps.
    public fun reputation_bps(p: &AgentPassport, ledger: &CalibrationLedger): u64 {
        assert!(object::id(ledger) == p.ledger_id, EWrongLedger);
        calibration::accuracy_bps(ledger)
    }

    // --- Views ---

    public fun bond_value(p: &AgentPassport): u64 { balance::value(&p.bond) }
    public fun slashed_value(p: &AgentPassport): u64 { balance::value(&p.slashed) }
    public fun decisions(p: &AgentPassport): u64 { p.decisions }
    public fun agent(p: &AgentPassport): address { p.agent }
    public fun name(p: &AgentPassport): String { p.name }

    #[test_only]
    public fun new_for_testing(
        name: vector<u8>,
        bond: Coin<SUI>,
        ledger: &CalibrationLedger,
        clock: &Clock,
        ctx: &mut TxContext,
    ): AgentPassport {
        AgentPassport {
            id: object::new(ctx),
            agent: ctx.sender(),
            name: string::utf8(name),
            bond: coin::into_balance(bond),
            slashed: balance::zero<SUI>(),
            ledger_id: calibration::ledger_id(ledger),
            decisions: 0,
            created_ms: clock::timestamp_ms(clock),
        }
    }
}
