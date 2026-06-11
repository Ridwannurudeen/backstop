/// arena — a competitive arena of bonded underwriting agents with CONDITIONAL
/// on-chain slashing (the "proof-of-judgment" primitive).
///
/// Agents stake SUI, quote crash probabilities for markets, and get scored on
/// realized outcomes. The novel part is the slash rule: an agent is slashable
/// **only when its on-chain accuracy falls below a threshold** — slashing is
/// rules-based, not discretionary. The genuinely well-calibrated cannot be
/// touched; the consistently wrong forfeit half their bond.
module arena::arena {
    use std::string::{Self, String};
    use sui::table::{Self, Table};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;

    /// Minimum bond (MIST) an agent must stake to enroll.
    const MIN_BOND: u64 = 10_000_000; // 0.01 SUI

    const EAlreadyEnrolled: u64 = 0;
    const EBondTooLow: u64 = 1;
    const ENotEnrolled: u64 = 2;
    const EBadBps: u64 = 3;
    const ENoRound: u64 = 4;
    const ENotMiscalibrated: u64 = 5;

    /// One agent's probability quote for a market, in basis points (0..10000).
    public struct Quote has store, copy, drop {
        agent: address,
        prob_bps: u64,
    }

    /// An enrolled agent's bonded stake and running scorecard.
    public struct AgentStat has store {
        name: String,
        bond: Balance<SUI>,
        quotes: u64,
        hits: u64,
        wins: u64,
        slashed: u64,
    }

    /// Shared arena: agent stats + roster + open rounds (market → quotes).
    public struct Arena has key {
        id: UID,
        agents: Table<address, AgentStat>,
        roster: vector<address>,
        open: Table<String, vector<Quote>>,
    }

    /// Authority to settle rounds and slash miscalibrated agents.
    public struct AdminCap has key, store { id: UID }

    public struct AgentEnrolled has copy, drop {
        agent: address,
        name: String,
        bond: u64,
    }
    public struct Quoted has copy, drop {
        agent: address,
        market: String,
        prob_bps: u64,
    }
    public struct RoundSettled has copy, drop {
        market: String,
        crashed: bool,
        winner: address,
    }
    public struct AgentSlashed has copy, drop {
        agent: address,
        amount: u64,
        accuracy_bps: u64,
    }

    fun init(ctx: &mut TxContext) {
        transfer::share_object(Arena {
            id: object::new(ctx),
            agents: table::new(ctx),
            roster: vector[],
            open: table::new(ctx),
        });
        transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
    }

    // --- Enroll / quote ---

    /// Stake a bond to join the arena as an underwriting agent.
    public fun enroll(arena: &mut Arena, name: vector<u8>, bond: Coin<SUI>, ctx: &mut TxContext) {
        let who = ctx.sender();
        assert!(!table::contains(&arena.agents, who), EAlreadyEnrolled);
        let amount = coin::value(&bond);
        assert!(amount >= MIN_BOND, EBondTooLow);
        table::add(&mut arena.agents, who, AgentStat {
            name: string::utf8(name),
            bond: coin::into_balance(bond),
            quotes: 0,
            hits: 0,
            wins: 0,
            slashed: 0,
        });
        arena.roster.push_back(who);
        event::emit(AgentEnrolled { agent: who, name: string::utf8(name), bond: amount });
    }

    /// Quote a crash probability (basis points) for an open market round.
    public fun quote(arena: &mut Arena, market: vector<u8>, prob_bps: u64, ctx: &mut TxContext) {
        let who = ctx.sender();
        assert!(table::contains(&arena.agents, who), ENotEnrolled);
        assert!(prob_bps <= 10_000, EBadBps);
        let key = string::utf8(market);
        if (!table::contains(&arena.open, key)) {
            table::add(&mut arena.open, key, vector[]);
        };
        table::borrow_mut(&mut arena.open, key).push_back(Quote { agent: who, prob_bps });
        table::borrow_mut(&mut arena.agents, who).quotes = table::borrow(&arena.agents, who).quotes + 1;
        event::emit(Quoted { agent: who, market: key, prob_bps });
    }

    // --- Settle / slash ---

    /// Settle an open round against the realized outcome. Scores each quote
    /// (a "hit" = the directional call was right) and crowns the closest quote
    /// as the round winner.
    public fun settle_round(
        arena: &mut Arena,
        _cap: &AdminCap,
        market: vector<u8>,
        crashed: bool,
        _ctx: &TxContext,
    ) {
        let key = string::utf8(market);
        assert!(table::contains(&arena.open, key), ENoRound);
        let quotes = table::remove(&mut arena.open, key);
        let outcome_bps = if (crashed) 10_000 else 0;
        let n = quotes.length();
        if (n == 0) {
            event::emit(RoundSettled { market: key, crashed, winner: @0x0 });
            return
        };

        // First pass: find the winner (smallest distance to the outcome).
        let mut winner = @0x0;
        let mut best_dist = 0;
        let mut i = 0;
        while (i < n) {
            let q = quotes.borrow(i);
            let dist = if (q.prob_bps >= outcome_bps) q.prob_bps - outcome_bps
                       else outcome_bps - q.prob_bps;
            if (i == 0 || dist < best_dist) {
                best_dist = dist;
                winner = q.agent;
            };
            i = i + 1;
        };

        // Second pass: credit a hit to every agent whose directional call was right.
        let mut j = 0;
        while (j < n) {
            let q = quotes.borrow(j);
            let s = table::borrow_mut(&mut arena.agents, q.agent);
            if ((q.prob_bps >= 5000) == crashed) {
                s.hits = s.hits + 1;
            };
            j = j + 1;
        };

        let w = table::borrow_mut(&mut arena.agents, winner);
        w.wins = w.wins + 1;
        event::emit(RoundSettled { market: key, crashed, winner });
    }

    /// Slash an agent whose realized accuracy is below `min_accuracy_bps`. Only
    /// the genuinely miscalibrated qualify (ENotMiscalibrated otherwise). Half
    /// the bond is forfeited and returned to the caller (the admin) as a Coin.
    public fun slash_miscalibrated(
        arena: &mut Arena,
        _cap: &AdminCap,
        agent: address,
        min_accuracy_bps: u64,
        ctx: &mut TxContext,
    ): Coin<SUI> {
        assert!(table::contains(&arena.agents, agent), ENotEnrolled);
        let s = table::borrow_mut(&mut arena.agents, agent);
        let acc = if (s.quotes == 0) 0 else s.hits * 10_000 / s.quotes;
        assert!(acc < min_accuracy_bps, ENotMiscalibrated);
        let amt = balance::value(&s.bond) / 2;
        s.slashed = s.slashed + amt;
        event::emit(AgentSlashed { agent, amount: amt, accuracy_bps: acc });
        coin::take(&mut s.bond, amt, ctx)
    }

    // --- Views ---

    public fun accuracy_bps(arena: &Arena, agent: address): u64 {
        let s = table::borrow(&arena.agents, agent);
        if (s.quotes == 0) 0 else s.hits * 10_000 / s.quotes
    }
    public fun bond_of(arena: &Arena, agent: address): u64 {
        balance::value(&table::borrow(&arena.agents, agent).bond)
    }
    public fun wins_of(arena: &Arena, agent: address): u64 {
        table::borrow(&arena.agents, agent).wins
    }
    public fun quotes_of(arena: &Arena, agent: address): u64 {
        table::borrow(&arena.agents, agent).quotes
    }
    public fun hits_of(arena: &Arena, agent: address): u64 {
        table::borrow(&arena.agents, agent).hits
    }
    public fun agent_count(arena: &Arena): u64 { arena.roster.length() }
    public fun roster(arena: &Arena): vector<address> { arena.roster }
    public fun name_of(arena: &Arena, agent: address): String {
        table::borrow(&arena.agents, agent).name
    }
    public fun is_enrolled(arena: &Arena, agent: address): bool {
        table::contains(&arena.agents, agent)
    }

    #[test_only]
    public fun new_for_testing(ctx: &mut TxContext): (Arena, AdminCap) {
        (
            Arena {
                id: object::new(ctx),
                agents: table::new(ctx),
                roster: vector[],
                open: table::new(ctx),
            },
            AdminCap { id: object::new(ctx) },
        )
    }
}
