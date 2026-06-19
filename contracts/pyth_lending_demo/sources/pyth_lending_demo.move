/// Backstop Pyth lending demo — a protocol that consumes the mainnet DepegCoverPool.
///
/// The production analog of `lending_demo`: where that market settles on the
/// subjective RiskFeed, this one buys depeg cover that settles TRUSTLESSLY against
/// Pyth. A collateral-reserve lending market insures its stablecoin exposure (e.g. a
/// suiUSDe reserve) by holding a pool `BuyerCap`, buying cover from a live
/// `DepegCoverPool<T>`, and retaining the policy inside the market object.
/// When Pyth reports the insured asset below the pool's depeg floor a keeper
/// latches the breach, and the market claims the payout straight into its
/// reserve — an on-chain bad-debt backstop whose settlement nobody has to trust
/// Backstop for.
module pyth_lending_demo::pyth_lending_demo {
    use std::string::{Self, String};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use sui::event;
    use pyth::price_info::PriceInfoObject;
    use pyth_cover_pool::pyth_cover_pool::{Self, BuyerCap, DepegCoverPool, Policy};

    /// Market is already insured by a live policy.
    const EAlreadyInsured: u64 = 0;
    /// Market holds no policy to record or claim against.
    const ENotInsured: u64 = 1;
    /// Market already has a pool buyer capability installed.
    const EAlreadyHasBuyerCap: u64 = 2;
    /// Market has no buyer capability installed.
    const ENoBuyerCap: u64 = 3;

    /// A collateral-reserve lending market that backstops a depeg shortfall with
    /// a Pyth-settled cover policy.
    public struct LendingMarket<phantom T> has key {
        id: UID,
        asset: String,
        reserve: Balance<T>,
        buyer_cap: Option<BuyerCap<T>>,
        policy: Option<Policy<T>>,
    }

    /// Emitted when a depeg payout is claimed into the market's reserve.
    public struct ShortfallCovered has copy, drop {
        asset: String,
        payout: u64,
    }

    public fun new_market<T>(asset: String, ctx: &mut TxContext): LendingMarket<T> {
        LendingMarket {
            id: object::new(ctx),
            asset,
            reserve: balance::zero<T>(),
            buyer_cap: option::none(),
            policy: option::none(),
        }
    }

    /// Create and share a lending market for `asset` (UTF-8 bytes).
    public fun create_and_share<T>(asset: vector<u8>, ctx: &mut TxContext) {
        transfer::share_object(new_market<T>(string::utf8(asset), ctx));
    }

    /// Add capital to the market's reserve.
    public fun deposit_reserve<T>(m: &mut LendingMarket<T>, c: Coin<T>) {
        balance::join(&mut m.reserve, coin::into_balance(c));
    }

    /// Install the pool buyer capability into this market. After this, cover can
    /// be bought only into the market object and claimed only into its reserve.
    public fun install_buyer_cap<T>(m: &mut LendingMarket<T>, cap: BuyerCap<T>) {
        assert!(option::is_none(&m.buyer_cap), EAlreadyHasBuyerCap);
        option::fill(&mut m.buyer_cap, cap);
    }

    /// Buy depeg cover from `pool` and hold the policy. The market may hold one
    /// policy at a time.
    public fun insure<T>(
        m: &mut LendingMarket<T>,
        pool: &mut DepegCoverPool<T>,
        premium: Coin<T>,
        cover: u64,
        expiry_ms: u64,
        price_info_object: &PriceInfoObject,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<T> {
        assert!(option::is_none(&m.policy), EAlreadyInsured);
        assert!(option::is_some(&m.buyer_cap), ENoBuyerCap);
        let (policy, refund) = pyth_cover_pool::buy_cover_with_cap(
            pool, option::borrow(&m.buyer_cap), premium, cover, expiry_ms,
            price_info_object, clock, ctx,
        );
        option::fill(&mut m.policy, policy);
        refund
    }

    /// Record a sub-threshold observation on the held policy by reading Pyth on-chain.
    /// The first call arms the dwell; a confirming call at least `min_dwell_secs` later
    /// latches the payout, so it can be claimed even after the price recovers. Aborts
    /// (via `record_breach`) unless the feed is at/below the pool floor and unexpired.
    public fun record_shortfall<T>(
        m: &mut LendingMarket<T>,
        pool: &mut DepegCoverPool<T>,
        price_info_object: &PriceInfoObject,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(option::is_some(&m.policy), ENotInsured);
        pyth_cover_pool::record_breach(
            pool, option::borrow_mut(&mut m.policy), price_info_object, clock, ctx,
        );
    }

    /// Claim the latched payout into the reserve. Aborts (via `claim_latched`) if no
    /// breach was recorded — that's correct, no free payout.
    public fun cover_shortfall<T>(
        m: &mut LendingMarket<T>,
        pool: &mut DepegCoverPool<T>,
        ctx: &mut TxContext,
    ) {
        assert!(option::is_some(&m.policy), ENotInsured);
        let policy = option::extract(&mut m.policy);
        let payout = pyth_cover_pool::claim_latched(pool, policy, ctx);
        event::emit(ShortfallCovered { asset: m.asset, payout: coin::value(&payout) });
        balance::join(&mut m.reserve, coin::into_balance(payout));
    }

    // --- Views ---

    public fun reserve_value<T>(m: &LendingMarket<T>): u64 { balance::value(&m.reserve) }
    public fun has_buyer_cap<T>(m: &LendingMarket<T>): bool { option::is_some(&m.buyer_cap) }
    public fun is_insured<T>(m: &LendingMarket<T>): bool { option::is_some(&m.policy) }
    public fun asset<T>(m: &LendingMarket<T>): String { m.asset }

    #[test_only]
    public fun new_for_testing<T>(asset: String, ctx: &mut TxContext): LendingMarket<T> {
        new_market<T>(asset, ctx)
    }

    #[test_only]
    /// Drive the dwell latch on the held policy at a given price magnitude (no Pyth
    /// object), so the consumer's claim path is unit-testable without a live feed.
    public fun record_shortfall_at_price_for_testing<T>(
        m: &mut LendingMarket<T>,
        pool: &mut DepegCoverPool<T>,
        price_mag: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(option::is_some(&m.policy), ENotInsured);
        pyth_cover_pool::latch_at_price_for_testing(
            pool, option::borrow_mut(&mut m.policy), price_mag, 0, clock, ctx,
        );
    }

    #[test_only]
    public fun insure_at_price_for_testing<T>(
        m: &mut LendingMarket<T>,
        pool: &mut DepegCoverPool<T>,
        premium: Coin<T>,
        cover: u64,
        expiry_ms: u64,
        price_mag: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(option::is_none(&m.policy), EAlreadyInsured);
        assert!(option::is_some(&m.buyer_cap), ENoBuyerCap);
        let policy = pyth_cover_pool::buy_cover_with_cap_at_price_for_testing(
            pool, option::borrow(&m.buyer_cap), premium, cover, expiry_ms,
            price_mag, 0, clock, ctx,
        );
        option::fill(&mut m.policy, policy);
    }
}
