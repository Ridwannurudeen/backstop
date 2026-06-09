/// Backstop RiskFeed — an on-chain, market-implied "probability of failure" registry.
///
/// An off-chain underwriter derives each reading from DeepBook Predict's on-chain
/// volatility surface, proves the derivation by anchoring the inputs to Walrus, and
/// publishes the result here. Any Sui contract can then read a market's latest
/// probability and gate its own logic on it — the shared risk primitive Sui lacks.
module risk_feed::risk_feed {
    use std::string::String;
    use sui::table::{Self, Table};
    use sui::clock::{Self, Clock};
    use sui::event;

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
    }

    /// Shared registry: market key -> latest reading. Readable by any contract.
    public struct RiskFeed has key {
        id: UID,
        readings: Table<String, Reading>,
    }

    /// Capability to publish / update readings.
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

    /// Reading for the requested market does not exist.
    const EReadingNotFound: u64 = 0;
    /// Probability out of the [0, 10_000] bps range.
    const EBadProbability: u64 = 1;

    fun init(ctx: &mut TxContext) {
        transfer::share_object(RiskFeed {
            id: object::new(ctx),
            readings: table::new<String, Reading>(ctx),
        });
        transfer::transfer(PublisherCap { id: object::new(ctx) }, tx_context::sender(ctx));
    }

    /// Publish (or overwrite) the latest probability-of-failure for `market`.
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
        assert!(prob_bps <= 10_000, EBadProbability);
        let ts_ms = clock::timestamp_ms(clock);
        let entry = Reading {
            prob_bps,
            ref_price,
            walrus_blob,
            ts_ms,
            updated_by: tx_context::sender(ctx),
        };
        if (table::contains(&feed.readings, market)) {
            *table::borrow_mut(&mut feed.readings, market) = entry;
        } else {
            table::add(&mut feed.readings, market, entry);
        };
        event::emit(ReadingPublished { market, prob_bps, ref_price, walrus_blob, ts_ms });
    }

    /// Latest probability (bps) for `market`. Aborts if none.
    public fun probability_bps(feed: &RiskFeed, market: String): u64 {
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

    // --- Reading field accessors (for external consumers) ---
    public fun prob_bps(r: &Reading): u64 { r.prob_bps }
    public fun ref_price(r: &Reading): u64 { r.ref_price }
    public fun ts_ms(r: &Reading): u64 { r.ts_ms }
    public fun walrus_blob(r: &Reading): String { r.walrus_blob }
    public fun updated_by(r: &Reading): address { r.updated_by }
}
