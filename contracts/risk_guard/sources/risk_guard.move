/// Backstop RiskFeed consumer — a worked example of the risk primitive in action.
///
/// A `GuardedTreasury` is a treasury whose withdrawals freeze automatically when
/// DeepBook Predict's market-implied probability of a crash (read from the on-chain
/// `RiskFeed`) exceeds the treasury's tolerance. It's a market-priced circuit
/// breaker — the thing Sui reached for a 90.9% validator rollback vote to do during
/// the Cetus exploit, expressed instead as a primitive any protocol can compose.
module risk_guard::risk_guard {
    use std::string::{Self, String};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use risk_feed::risk_feed::{Self, RiskFeed};

    /// Withdrawal blocked: the market-implied crash probability exceeds tolerance.
    const ECrashRiskTooHigh: u64 = 0;

    /// A treasury gated on the crash risk of `market`. Funds can be deposited
    /// freely, but withdrawals require the latest feed reading to be within
    /// `max_prob_bps` (basis points of implied probability of failure).
    public struct GuardedTreasury<phantom T> has key {
        id: UID,
        market: String,
        max_prob_bps: u64,
        funds: Balance<T>,
    }

    public fun new_treasury<T>(
        market: String,
        max_prob_bps: u64,
        ctx: &mut TxContext,
    ): GuardedTreasury<T> {
        GuardedTreasury {
            id: object::new(ctx),
            market,
            max_prob_bps,
            funds: balance::zero<T>(),
        }
    }

    /// Create and share a guarded treasury for `market` (UTF-8 bytes, e.g. b"BTC").
    public entry fun create_and_share<T>(
        market: vector<u8>,
        max_prob_bps: u64,
        ctx: &mut TxContext,
    ) {
        transfer::share_object(new_treasury<T>(string::utf8(market), max_prob_bps, ctx));
    }

    public fun deposit<T>(t: &mut GuardedTreasury<T>, c: Coin<T>) {
        balance::join(&mut t.funds, coin::into_balance(c));
    }

    /// True while the market's latest crash probability is within tolerance.
    /// An unknown market (no reading yet) is treated as unsafe — fail closed.
    public fun is_safe<T>(t: &GuardedTreasury<T>, feed: &RiskFeed): bool {
        risk_feed::has_market(feed, t.market)
            && risk_feed::probability_bps(feed, t.market) <= t.max_prob_bps
    }

    /// Withdraw `amount` — aborts unless the feed says the market is calm enough.
    public fun withdraw<T>(
        t: &mut GuardedTreasury<T>,
        feed: &RiskFeed,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<T> {
        assert!(is_safe(t, feed), ECrashRiskTooHigh);
        coin::take(&mut t.funds, amount, ctx)
    }

    /// Remaining headroom (bps) before withdrawals freeze; 0 if already frozen
    /// or the market is unknown.
    public fun headroom_bps<T>(t: &GuardedTreasury<T>, feed: &RiskFeed): u64 {
        if (!risk_feed::has_market(feed, t.market)) return 0;
        let p = risk_feed::probability_bps(feed, t.market);
        if (p >= t.max_prob_bps) 0 else t.max_prob_bps - p
    }

    public fun value<T>(t: &GuardedTreasury<T>): u64 { balance::value(&t.funds) }
    public fun market<T>(t: &GuardedTreasury<T>): String { t.market }
    public fun max_prob_bps<T>(t: &GuardedTreasury<T>): u64 { t.max_prob_bps }
}
