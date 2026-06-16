/// Backstop Pyth lending demo — a protocol that consumes the mainnet DepegCoverPool.
///
/// The production analog of `lending_demo`: where that market settles on the
/// subjective RiskFeed, this one buys depeg cover that settles TRUSTLESSLY against
/// Pyth. A SUI-reserve lending market insures its stablecoin exposure (e.g. a
/// suiUSDe reserve) by buying cover from a live `DepegCoverPool<SUI>`; when Pyth
/// reports the insured asset below the pool's depeg floor a keeper latches the
/// breach, and the market claims the payout straight into its SUI reserve — an
/// on-chain bad-debt backstop whose settlement nobody has to trust Backstop for.
module pyth_lending_demo::pyth_lending_demo {
    use std::string::{Self, String};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use sui::sui::SUI;
    use sui::event;
    use pyth::price_info::PriceInfoObject;
    use pyth_cover_pool::pyth_cover_pool::{Self, DepegCoverPool, Policy};

    /// Market is already insured by a live policy.
    const EAlreadyInsured: u64 = 0;
    /// Market holds no policy to record or claim against.
    const ENotInsured: u64 = 1;

    /// A SUI-reserve lending market that backstops a depeg shortfall with a
    /// Pyth-settled cover policy.
    public struct LendingMarket has key {
        id: UID,
        asset: String,
        reserve: Balance<SUI>,
        policy: Option<Policy<SUI>>,
    }

    /// Emitted when a depeg payout is claimed into the market's reserve.
    public struct ShortfallCovered has copy, drop {
        asset: String,
        payout: u64,
    }

    public fun new_market(asset: String, ctx: &mut TxContext): LendingMarket {
        LendingMarket {
            id: object::new(ctx),
            asset,
            reserve: balance::zero<SUI>(),
            policy: option::none(),
        }
    }

    /// Create and share a lending market for `asset` (UTF-8 bytes).
    public entry fun create_and_share(asset: vector<u8>, ctx: &mut TxContext) {
        transfer::share_object(new_market(string::utf8(asset), ctx));
    }

    /// Add capital to the market's SUI reserve.
    public fun deposit_reserve(m: &mut LendingMarket, c: Coin<SUI>) {
        balance::join(&mut m.reserve, coin::into_balance(c));
    }

    /// Buy depeg cover from `pool` and hold the policy. The market may hold one
    /// policy at a time.
    public fun insure(
        m: &mut LendingMarket,
        pool: &mut DepegCoverPool<SUI>,
        premium: Coin<SUI>,
        cover: u64,
        expiry_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(option::is_none(&m.policy), EAlreadyInsured);
        let policy = pyth_cover_pool::buy_cover(pool, premium, cover, expiry_ms, clock, ctx);
        option::fill(&mut m.policy, policy);
    }

    /// Record a sub-threshold observation on the held policy by reading Pyth on-chain.
    /// The first call arms the dwell; a confirming call at least `min_dwell_secs` later
    /// latches the payout, so it can be claimed even after the price recovers. Aborts
    /// (via `record_breach`) unless the feed is at/below the pool floor and unexpired.
    public fun record_shortfall(
        m: &mut LendingMarket,
        pool: &mut DepegCoverPool<SUI>,
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
    public fun cover_shortfall(
        m: &mut LendingMarket,
        pool: &mut DepegCoverPool<SUI>,
        ctx: &mut TxContext,
    ) {
        assert!(option::is_some(&m.policy), ENotInsured);
        let policy = option::extract(&mut m.policy);
        let payout = pyth_cover_pool::claim_latched(pool, policy, ctx);
        event::emit(ShortfallCovered { asset: m.asset, payout: coin::value(&payout) });
        balance::join(&mut m.reserve, coin::into_balance(payout));
    }

    // --- Views ---

    public fun reserve_value(m: &LendingMarket): u64 { balance::value(&m.reserve) }
    public fun is_insured(m: &LendingMarket): bool { option::is_some(&m.policy) }
    public fun asset(m: &LendingMarket): String { m.asset }

    #[test_only]
    public fun new_for_testing(asset: String, ctx: &mut TxContext): LendingMarket {
        new_market(asset, ctx)
    }

    #[test_only]
    /// Drive the dwell latch on the held policy at a given price magnitude (no Pyth
    /// object), so the consumer's claim path is unit-testable without a live feed.
    public fun record_shortfall_at_price_for_testing(
        m: &mut LendingMarket,
        pool: &mut DepegCoverPool<SUI>,
        price_mag: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(option::is_some(&m.policy), ENotInsured);
        pyth_cover_pool::latch_at_price_for_testing(
            pool, option::borrow_mut(&mut m.policy), price_mag, 0, clock, ctx,
        );
    }
}
