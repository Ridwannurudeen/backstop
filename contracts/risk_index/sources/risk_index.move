/// SRX — the Sui Risk Index family (see INDEX.md for the methodology).
///
/// A bonded-publisher index oracle. Each epoch a staked publisher writes the three
/// SRX indices (CRASH / VOL / TAIL) for a market, derived off-chain from DeepBook
/// Predict's binary CDF, with the full input grid anchored to Walrus (`cdf_blob`).
/// Anyone can read an index in one call, or **challenge** a published reading by
/// posting a bond; a challenge resolves by slashing the wrong side. Trust is
/// cryptoeconomic — the difference between SRX and a fear index a website prints.
module risk_index::risk_index {
    use std::string::{Self, String};
    use sui::table::{Self, Table};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::clock::{Self, Clock};
    use sui::event;

    /// Minimum bond (MIST) a publisher must stake to publish.
    const MIN_BOND: u64 = 100_000_000; // 0.1 SUI

    const ENotPublisher: u64 = 0;
    const EBondTooLow: u64 = 1;
    const EReadingNotFound: u64 = 2;
    const EAlreadyChallenged: u64 = 3;
    const ENotChallenged: u64 = 4;
    const EAlreadyStaked: u64 = 5;
    const EBadBps: u64 = 6;

    /// A published SRX snapshot for one market (underlying + horizon).
    public struct IndexReading has store, copy, drop {
        underlying: String,
        horizon_ms: u64,
        ref_price: u64,
        srx_crash_bps: u64, // P(>=20% drawdown), basis points (0..10000)
        srx_vol_bps: u64,   // model-free implied vol, bps (may exceed 10000)
        srx_tail_bps: u64,  // expected shortfall, bps of ref price
        cdf_blob: String,   // Walrus blob: full {strike, prob} grid + raw quotes
        ts_ms: u64,
        publisher: address,
        challenged: bool,
    }

    /// A publisher's protocol-custodied stake (so it can be slashed).
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

    /// Shared index registry: readings + publisher stakes + open challenges.
    public struct RiskIndex has key {
        id: UID,
        readings: Table<String, IndexReading>,
        markets: vector<String>,
        stakes: Table<address, Stake>,
        challenges: Table<String, Challenge>,
    }

    /// Authority to resolve challenges. (Today the protocol/DAO; roadmap = a ZK
    /// proof of the off-chain derivation, or an on-chain price read once Predict
    /// exposes binary pricing cross-package. The trust boundary is documented.)
    public struct AdminCap has key, store { id: UID }

    public struct PublisherRegistered has copy, drop {
        publisher: address,
        name: String,
        bond: u64,
    }
    public struct IndexPublished has copy, drop {
        market: String,
        srx_crash_bps: u64,
        srx_vol_bps: u64,
        srx_tail_bps: u64,
        publisher: address,
    }
    public struct IndexChallenged has copy, drop {
        market: String,
        challenger: address,
        bond: u64,
    }
    public struct ChallengeResolved has copy, drop {
        market: String,
        upheld: bool,
        slashed: u64,
    }

    fun init(ctx: &mut TxContext) {
        transfer::share_object(RiskIndex {
            id: object::new(ctx),
            readings: table::new(ctx),
            markets: vector[],
            stakes: table::new(ctx),
            challenges: table::new(ctx),
        });
        transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
    }

    // --- Publishing ---

    /// Stake a bond to become a publisher.
    public fun register_publisher(
        index: &mut RiskIndex,
        name: vector<u8>,
        bond: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let who = ctx.sender();
        assert!(!table::contains(&index.stakes, who), EAlreadyStaked);
        let amount = coin::value(&bond);
        assert!(amount >= MIN_BOND, EBondTooLow);
        table::add(&mut index.stakes, who, Stake {
            bond: coin::into_balance(bond),
            name: string::utf8(name),
            published: 0,
        });
        event::emit(PublisherRegistered { publisher: who, name: string::utf8(name), bond: amount });
    }

    /// Add more collateral to an existing stake.
    public fun top_up(index: &mut RiskIndex, c: Coin<SUI>, ctx: &TxContext) {
        let who = ctx.sender();
        assert!(table::contains(&index.stakes, who), ENotPublisher);
        balance::join(&mut table::borrow_mut(&mut index.stakes, who).bond, coin::into_balance(c));
    }

    /// Publish (or overwrite) the SRX indices for `market`. Sender must be a bonded
    /// publisher with at least MIN_BOND staked.
    public fun publish(
        index: &mut RiskIndex,
        market: vector<u8>,
        underlying: vector<u8>,
        horizon_ms: u64,
        ref_price: u64,
        srx_crash_bps: u64,
        srx_vol_bps: u64,
        srx_tail_bps: u64,
        cdf_blob: vector<u8>,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        let who = ctx.sender();
        assert!(table::contains(&index.stakes, who), ENotPublisher);
        let stake = table::borrow_mut(&mut index.stakes, who);
        assert!(balance::value(&stake.bond) >= MIN_BOND, EBondTooLow);
        assert!(srx_crash_bps <= 10_000, EBadBps); // a probability
        stake.published = stake.published + 1;

        let key = string::utf8(market);
        let reading = IndexReading {
            underlying: string::utf8(underlying),
            horizon_ms,
            ref_price,
            srx_crash_bps,
            srx_vol_bps,
            srx_tail_bps,
            cdf_blob: string::utf8(cdf_blob),
            ts_ms: clock::timestamp_ms(clock),
            publisher: who,
            challenged: false,
        };
        if (table::contains(&index.readings, key)) {
            *table::borrow_mut(&mut index.readings, key) = reading;
        } else {
            table::add(&mut index.readings, key, reading);
            index.markets.push_back(key);
        };
        event::emit(IndexPublished { market: key, srx_crash_bps, srx_vol_bps, srx_tail_bps, publisher: who });
    }

    // --- Challenge / slash ---

    /// Challenge a published reading by posting a bond. If the challenge is upheld,
    /// the publisher's stake is slashed to the challenger; if not, the challenger
    /// forfeits the bond to the publisher.
    public fun challenge(
        index: &mut RiskIndex,
        market: vector<u8>,
        bond: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let key = string::utf8(market);
        assert!(table::contains(&index.readings, key), EReadingNotFound);
        let reading = table::borrow_mut(&mut index.readings, key);
        assert!(!reading.challenged, EAlreadyChallenged);
        reading.challenged = true;
        let amount = coin::value(&bond);
        let challenger = ctx.sender();
        table::add(&mut index.challenges, key, Challenge {
            challenger,
            bond: coin::into_balance(bond),
        });
        event::emit(IndexChallenged { market: key, challenger, bond: amount });
    }

    /// Resolve an open challenge. `upheld == true` means the published index was
    /// wrong → slash the publisher; `false` → the challenger forfeits.
    public fun resolve_challenge(
        index: &mut RiskIndex,
        _admin: &AdminCap,
        market: vector<u8>,
        upheld: bool,
        ctx: &mut TxContext,
    ) {
        let key = string::utf8(market);
        assert!(table::contains(&index.challenges, key), ENotChallenged);
        let Challenge { challenger, bond: cbond } = table::remove(&mut index.challenges, key);
        let reading = table::borrow_mut(&mut index.readings, key);
        reading.challenged = false;
        let publisher = reading.publisher;

        if (upheld) {
            // Slash the publisher's stake by the challenger's bond amount and pay
            // the challenger their bond back plus the slashed reward.
            let cval = balance::value(&cbond);
            let stake = table::borrow_mut(&mut index.stakes, publisher);
            let avail = balance::value(&stake.bond);
            let slash_amt = if (cval <= avail) cval else avail;
            let slashed = balance::split(&mut stake.bond, slash_amt);
            let mut payout = cbond;
            balance::join(&mut payout, slashed);
            transfer::public_transfer(coin::from_balance(payout, ctx), challenger);
            event::emit(ChallengeResolved { market: key, upheld: true, slashed: slash_amt });
        } else {
            // Challenger forfeits the bond into the publisher's stake.
            balance::join(&mut table::borrow_mut(&mut index.stakes, publisher).bond, cbond);
            event::emit(ChallengeResolved { market: key, upheld: false, slashed: 0 });
        };
    }

    // --- Views ---

    public fun srx_crash(index: &RiskIndex, market: String): u64 {
        assert!(table::contains(&index.readings, market), EReadingNotFound);
        table::borrow(&index.readings, market).srx_crash_bps
    }
    public fun srx_vol(index: &RiskIndex, market: String): u64 {
        assert!(table::contains(&index.readings, market), EReadingNotFound);
        table::borrow(&index.readings, market).srx_vol_bps
    }
    public fun srx_tail(index: &RiskIndex, market: String): u64 {
        assert!(table::contains(&index.readings, market), EReadingNotFound);
        table::borrow(&index.readings, market).srx_tail_bps
    }
    public fun reading(index: &RiskIndex, market: String): &IndexReading {
        assert!(table::contains(&index.readings, market), EReadingNotFound);
        table::borrow(&index.readings, market)
    }
    public fun has_market(index: &RiskIndex, market: String): bool {
        table::contains(&index.readings, market)
    }
    public fun count(index: &RiskIndex): u64 { index.markets.length() }
    public fun is_challenged(index: &RiskIndex, market: String): bool {
        table::contains(&index.readings, market) && table::borrow(&index.readings, market).challenged
    }
    public fun stake_bond(index: &RiskIndex, who: address): u64 {
        if (!table::contains(&index.stakes, who)) 0
        else balance::value(&table::borrow(&index.stakes, who).bond)
    }

    public fun r_crash(r: &IndexReading): u64 { r.srx_crash_bps }
    public fun r_vol(r: &IndexReading): u64 { r.srx_vol_bps }
    public fun r_tail(r: &IndexReading): u64 { r.srx_tail_bps }
    public fun r_ref_price(r: &IndexReading): u64 { r.ref_price }
    public fun r_publisher(r: &IndexReading): address { r.publisher }
    public fun r_cdf_blob(r: &IndexReading): String { r.cdf_blob }

    #[test_only]
    public fun new_for_testing(ctx: &mut TxContext): (RiskIndex, AdminCap) {
        (
            RiskIndex {
                id: object::new(ctx),
                readings: table::new(ctx),
                markets: vector[],
                stakes: table::new(ctx),
                challenges: table::new(ctx),
            },
            AdminCap { id: object::new(ctx) },
        )
    }
}
