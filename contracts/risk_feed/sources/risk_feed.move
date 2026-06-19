/// Backstop RiskFeed — an on-chain, market-implied "probability of failure" registry.
///
/// An off-chain underwriter derives each reading from DeepBook Predict's on-chain
/// volatility surface, proves the derivation by anchoring the inputs to Walrus, and
/// publishes the result here. Any Sui contract can then read a market's latest
/// probability and gate its own logic on it — the shared risk primitive Sui lacks.
///
/// Trust model (research/testnet, admin-resolved today):
///   - Anyone can become a publisher by staking a slashable SUI bond.
///   - A published reading can be **challenged** by posting a bond; resolution is
///     still made through `PublisherCap`, so this is accountable but not trustless.
///   - Default probability reads reject challenged readings; analytics can opt into
///     `*_unchecked` when they explicitly want to display disputed data.
///   - Reads can demand **freshness** (`*_fresh`), so consumers never settle on a
///     stale reading (the failure mode a naive parametric trigger is prone to).
///
/// `publish` (capability-gated) remains as a bootstrap/admin path; the production
/// write path is `publish_bonded`, open to any bonded publisher.
module risk_feed::risk_feed {
    use std::string::{Self, String};
    use sui::table::{Self, Table};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::clock::{Self, Clock};
    use sui::event;

    /// Minimum bond (MIST) a publisher must stake to publish via `publish_bonded`.
    const MIN_BOND: u64 = 100_000_000; // 0.1 SUI

    /// Minimum bond (MIST) required to open a challenge — same scale as `MIN_BOND`,
    /// so a dust challenge can't freeze a market's reads for free.
    const MIN_CHALLENGE_BOND: u64 = MIN_BOND;

    /// Fraction of a slashed publisher's stake forfeited on an upheld challenge, in
    /// basis points. Capped so a challenge can never confiscate a whole stake.
    const SLASH_BPS: u64 = 5_000; // 50%

    /// Latest market-implied probability-of-failure reading for one market.
    public struct Reading has store, copy, drop {
        /// implied probability of failure, in basis points (0..=10_000)
        prob_bps: u64,
        /// reference price at publication (1e9-scaled), for context
        ref_price: u64,
        /// Walrus blob id proving the off-chain inputs + derivation
        walrus_blob: String,
        /// on-chain publication time (ms)
        ts_ms: u64,
        /// publisher address
        updated_by: address,
        /// true while an unresolved challenge is open against this reading
        challenged: bool,
    }

    /// A publisher's protocol-custodied stake (so it can be slashed on a bad reading).
    public struct Stake has store {
        bond: Balance<SUI>,
        name: String,
        published: u64,
    }

    /// An open challenge against a reading; the challenger's bond is escrowed here.
    public struct Challenge has store {
        challenger: address,
        bond: Balance<SUI>,
    }

    /// Shared registry: market key -> latest reading, plus publisher stakes and
    /// open challenges. Readable by any contract.
    public struct RiskFeed has key {
        id: UID,
        readings: Table<String, Reading>,
        stakes: Table<address, Stake>,
        challenges: Table<String, Challenge>,
        /// number of open challenges outstanding against each publisher's readings
        open_challenges: Table<address, u64>,
        /// neutral protocol sink for slashed stake and forfeited challenge bonds
        slashed_pool: Balance<SUI>,
    }

    /// Bootstrap/admin capability: publish via the legacy path and resolve challenges.
    public struct PublisherCap has key, store {
        id: UID,
    }

    /// Emitted on every publish so indexers / UIs can stream readings.
    public struct ReadingPublished has copy, drop {
        market: String,
        prob_bps: u64,
        ref_price: u64,
        walrus_blob: String,
        ts_ms: u64,
    }

    public struct PublisherRegistered has copy, drop {
        publisher: address,
        name: String,
        bond: u64,
    }
    public struct ReadingChallenged has copy, drop {
        market: String,
        challenger: address,
        bond: u64,
    }
    public struct ChallengeResolved has copy, drop {
        market: String,
        upheld: bool,
        slashed: u64,
    }

    /// Reading for the requested market does not exist.
    const EReadingNotFound: u64 = 0;
    /// Probability out of the [0, 10_000] bps range.
    const EBadProbability: u64 = 1;
    /// Sender is not a registered publisher.
    const ENotPublisher: u64 = 2;
    /// Bond below MIN_BOND.
    const EBondTooLow: u64 = 3;
    /// Publisher already has a stake.
    const EAlreadyStaked: u64 = 4;
    /// A challenge is already open on this market (also blocks overwriting it).
    const EAlreadyChallenged: u64 = 5;
    /// No open challenge on this market.
    const ENotChallenged: u64 = 6;
    /// Reading is older than the caller's freshness bound.
    const EStale: u64 = 7;
    /// Reading is under an unresolved challenge.
    const EChallenged: u64 = 8;
    /// Challenge bond below MIN_CHALLENGE_BOND.
    const EChallengeBondTooLow: u64 = 9;
    /// Resolver is the same address as the challenger (self-dealing).
    const ESelfResolve: u64 = 10;
    /// Publisher has an open challenge and cannot unstake yet.
    const EOpenChallenge: u64 = 11;

    fun init(ctx: &mut TxContext) {
        transfer::share_object(RiskFeed {
            id: object::new(ctx),
            readings: table::new<String, Reading>(ctx),
            stakes: table::new<address, Stake>(ctx),
            challenges: table::new<String, Challenge>(ctx),
            open_challenges: table::new<address, u64>(ctx),
            slashed_pool: balance::zero<SUI>(),
        });
        transfer::transfer(PublisherCap { id: object::new(ctx) }, tx_context::sender(ctx));
    }

    // --- Internal write ---

    /// Write (or overwrite) the latest reading for `market`. A market with an open
    /// challenge cannot be overwritten until the challenge is resolved.
    fun write_reading(
        feed: &mut RiskFeed,
        market: String,
        prob_bps: u64,
        ref_price: u64,
        walrus_blob: String,
        who: address,
        ts_ms: u64,
    ) {
        assert!(prob_bps <= 10_000, EBadProbability);
        let entry = Reading { prob_bps, ref_price, walrus_blob, ts_ms, updated_by: who, challenged: false };
        if (table::contains(&feed.readings, market)) {
            assert!(!table::borrow(&feed.readings, market).challenged, EAlreadyChallenged);
            *table::borrow_mut(&mut feed.readings, market) = entry;
        } else {
            table::add(&mut feed.readings, market, entry);
        };
        event::emit(ReadingPublished { market, prob_bps, ref_price, walrus_blob, ts_ms });
    }

    // --- Publishing ---

    /// Legacy/bootstrap publish, gated by the `PublisherCap`. Prefer `publish_bonded`.
    public fun publish(
        feed: &mut RiskFeed,
        _cap: &PublisherCap,
        market: String,
        prob_bps: u64,
        ref_price: u64,
        walrus_blob: String,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        write_reading(
            feed, market, prob_bps, ref_price, walrus_blob,
            tx_context::sender(ctx), clock::timestamp_ms(clock),
        );
    }

    /// Stake a slashable bond to become a publisher.
    public fun register_publisher(
        feed: &mut RiskFeed,
        name: vector<u8>,
        bond: Coin<SUI>,
        ctx: &TxContext,
    ) {
        let who = tx_context::sender(ctx);
        assert!(!table::contains(&feed.stakes, who), EAlreadyStaked);
        let amount = coin::value(&bond);
        assert!(amount >= MIN_BOND, EBondTooLow);
        table::add(&mut feed.stakes, who, Stake {
            bond: coin::into_balance(bond),
            name: string::utf8(name),
            published: 0,
        });
        event::emit(PublisherRegistered { publisher: who, name: string::utf8(name), bond: amount });
    }

    /// Add more collateral to an existing stake.
    public fun top_up(feed: &mut RiskFeed, c: Coin<SUI>, ctx: &TxContext) {
        let who = tx_context::sender(ctx);
        assert!(table::contains(&feed.stakes, who), ENotPublisher);
        balance::join(&mut table::borrow_mut(&mut feed.stakes, who).bond, coin::into_balance(c));
    }

    /// Withdraw a publisher's residual stake. Blocked while any of the publisher's
    /// readings is under an open challenge, so a disputed publisher can't escape slashing.
    public fun unstake(feed: &mut RiskFeed, ctx: &mut TxContext): Coin<SUI> {
        let who = tx_context::sender(ctx);
        assert!(table::contains(&feed.stakes, who), ENotPublisher);
        assert!(!table::contains(&feed.open_challenges, who), EOpenChallenge);
        let Stake { bond, name: _, published: _ } = table::remove(&mut feed.stakes, who);
        coin::from_balance(bond, ctx)
    }

    /// Production publish: open to any bonded publisher (>= MIN_BOND staked).
    public fun publish_bonded(
        feed: &mut RiskFeed,
        market: String,
        prob_bps: u64,
        ref_price: u64,
        walrus_blob: String,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        let who = tx_context::sender(ctx);
        assert!(table::contains(&feed.stakes, who), ENotPublisher);
        let ts_ms = clock::timestamp_ms(clock);
        {
            let stake = table::borrow_mut(&mut feed.stakes, who);
            assert!(balance::value(&stake.bond) >= MIN_BOND, EBondTooLow);
            stake.published = stake.published + 1;
        };
        write_reading(feed, market, prob_bps, ref_price, walrus_blob, who, ts_ms);
    }

    // --- Challenge / slash ---

    /// Challenge a published reading by posting a bond (>= MIN_CHALLENGE_BOND, so a
    /// dust challenge can't freeze the reads for free). On resolution: if upheld, a
    /// fixed fraction of the publisher's stake is slashed to the neutral sink and the
    /// challenger recovers their bond; else the bond is forfeited to the neutral sink.
    public fun challenge(
        feed: &mut RiskFeed,
        market: String,
        bond: Coin<SUI>,
        ctx: &TxContext,
    ) {
        assert!(table::contains(&feed.readings, market), EReadingNotFound);
        let amount = coin::value(&bond);
        assert!(amount >= MIN_CHALLENGE_BOND, EChallengeBondTooLow);
        let reading = table::borrow_mut(&mut feed.readings, market);
        assert!(!reading.challenged, EAlreadyChallenged);
        reading.challenged = true;
        let publisher = reading.updated_by;
        let challenger = tx_context::sender(ctx);
        table::add(&mut feed.challenges, market, Challenge {
            challenger,
            bond: coin::into_balance(bond),
        });
        if (table::contains(&feed.open_challenges, publisher)) {
            let n = table::borrow_mut(&mut feed.open_challenges, publisher);
            *n = *n + 1;
        } else {
            table::add(&mut feed.open_challenges, publisher, 1);
        };
        event::emit(ReadingChallenged { market, challenger, bond: amount });
    }

    /// Resolve an open challenge. `upheld == true` → the reading was wrong: slash a
    /// fixed `SLASH_BPS` fraction of the publisher's stake into the neutral sink and
    /// return the challenger their own bond. `false` → the challenger forfeits their
    /// bond to the neutral sink. The resolver must not be the challenger, so a single
    /// party can't both open and rule on a challenge in their own favor.
    public fun resolve_challenge(
        feed: &mut RiskFeed,
        _cap: &PublisherCap,
        market: String,
        upheld: bool,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&feed.challenges, market), ENotChallenged);
        let Challenge { challenger, bond: cbond } = table::remove(&mut feed.challenges, market);
        assert!(tx_context::sender(ctx) != challenger, ESelfResolve);
        let reading = table::borrow_mut(&mut feed.readings, market);
        reading.challenged = false;
        let publisher = reading.updated_by;

        {
            let n = table::borrow_mut(&mut feed.open_challenges, publisher);
            *n = *n - 1;
            if (*n == 0) { table::remove(&mut feed.open_challenges, publisher); };
        };

        if (upheld) {
            let mut slash_amt = 0;
            if (table::contains(&feed.stakes, publisher)) {
                let stake = table::borrow_mut(&mut feed.stakes, publisher);
                let avail = balance::value(&stake.bond);
                slash_amt = avail * SLASH_BPS / 10_000;
                let slashed = balance::split(&mut stake.bond, slash_amt);
                balance::join(&mut feed.slashed_pool, slashed);
            };
            event::emit(ChallengeResolved { market, upheld: true, slashed: slash_amt });
            transfer::public_transfer(coin::from_balance(cbond, ctx), challenger);
        } else {
            balance::join(&mut feed.slashed_pool, cbond);
            event::emit(ChallengeResolved { market, upheld: false, slashed: 0 });
        };
    }

    // --- Reads ---

    /// Latest probability (bps) for `market`. Aborts if none or challenged.
    public fun probability_bps(feed: &RiskFeed, market: String): u64 {
        assert!(table::contains(&feed.readings, market), EReadingNotFound);
        let r = table::borrow(&feed.readings, market);
        assert!(!r.challenged, EChallenged);
        r.prob_bps
    }

    /// Latest probability (bps), but only if the reading is no older than `max_age_ms`.
    /// Aborts if the reading is challenged. Use this anywhere a stale or disputed
    /// reading could cause a wrong settlement.
    public fun probability_bps_fresh(
        feed: &RiskFeed,
        market: String,
        clock: &Clock,
        max_age_ms: u64,
    ): u64 {
        assert!(table::contains(&feed.readings, market), EReadingNotFound);
        let r = table::borrow(&feed.readings, market);
        assert!(!r.challenged, EChallenged);
        let now = clock::timestamp_ms(clock);
        assert!(now >= r.ts_ms && now - r.ts_ms <= max_age_ms, EStale);
        r.prob_bps
    }

    /// Latest probability (bps) even if challenged. Use only for dashboards,
    /// diagnostics, and dispute UIs that also surface `is_challenged`.
    public fun probability_bps_unchecked(feed: &RiskFeed, market: String): u64 {
        assert!(table::contains(&feed.readings, market), EReadingNotFound);
        table::borrow(&feed.readings, market).prob_bps
    }

    /// The full latest reading for `market`. Aborts if none.
    public fun reading(feed: &RiskFeed, market: String): &Reading {
        assert!(table::contains(&feed.readings, market), EReadingNotFound);
        table::borrow(&feed.readings, market)
    }

    public fun has_market(feed: &RiskFeed, market: String): bool {
        table::contains(&feed.readings, market)
    }

    public fun is_challenged(feed: &RiskFeed, market: String): bool {
        table::contains(&feed.readings, market) && table::borrow(&feed.readings, market).challenged
    }

    public fun stake_bond(feed: &RiskFeed, who: address): u64 {
        if (!table::contains(&feed.stakes, who)) 0
        else balance::value(&table::borrow(&feed.stakes, who).bond)
    }

    /// Total slashed stake and forfeited challenge bonds held in the neutral sink.
    public fun slashed_pool(feed: &RiskFeed): u64 {
        balance::value(&feed.slashed_pool)
    }

    // --- Reading field accessors (for external consumers) ---
    public fun prob_bps(r: &Reading): u64 { r.prob_bps }
    public fun ref_price(r: &Reading): u64 { r.ref_price }
    public fun ts_ms(r: &Reading): u64 { r.ts_ms }
    public fun walrus_blob(r: &Reading): String { r.walrus_blob }
    public fun updated_by(r: &Reading): address { r.updated_by }
    public fun challenged(r: &Reading): bool { r.challenged }

    #[test_only]
    /// Construct a feed + publisher cap directly in tests (init is not test-callable).
    public fun new_for_testing(ctx: &mut TxContext): (RiskFeed, PublisherCap) {
        (
            RiskFeed {
                id: object::new(ctx),
                readings: table::new<String, Reading>(ctx),
                stakes: table::new<address, Stake>(ctx),
                challenges: table::new<String, Challenge>(ctx),
                open_challenges: table::new<address, u64>(ctx),
                slashed_pool: balance::zero<SUI>(),
            },
            PublisherCap { id: object::new(ctx) },
        )
    }
}
