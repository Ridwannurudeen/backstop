/// Backstop lending demo - a protocol that consumed the legacy CoverPool.
///
/// The RiskFeed-settled cover lane is disabled in `cover_pool`, so this module is
/// retained only as the old integration shape. Use `pyth_lending_demo` for the
/// active Pyth-settled backstop path.
module lending_demo::lending_demo {
    use std::string::{Self, String};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use sui::event;
    use cover_pool::cover_pool::{Self, CoverPool, Policy};
    use risk_feed::risk_feed::RiskFeed;

    /// Market is already insured by a live policy.
    const EAlreadyInsured: u64 = 0;
    /// Market holds no policy to claim against.
    const ENotInsured: u64 = 1;

    /// A lending market that backstops its bad debt with a parametric cover policy.
    public struct LendingMarket<phantom T> has key {
        id: UID,
        market: String,
        reserve: Balance<T>,
        policy: Option<Policy<T>>,
    }

    /// Emitted when a crash payout is claimed into the market's reserve.
    public struct ShortfallCovered has copy, drop {
        market: String,
        payout: u64,
    }

    public fun new_market<T>(market: String, ctx: &mut TxContext): LendingMarket<T> {
        LendingMarket {
            id: object::new(ctx),
            market,
            reserve: balance::zero<T>(),
            policy: option::none(),
        }
    }

    /// Create and share a lending market for `market` (UTF-8 bytes).
    public fun create_and_share<T>(market: vector<u8>, ctx: &mut TxContext) {
        transfer::share_object(new_market<T>(string::utf8(market), ctx));
    }

    /// Add capital to the market's reserve.
    public fun deposit_reserve<T>(m: &mut LendingMarket<T>, c: Coin<T>) {
        balance::join(&mut m.reserve, coin::into_balance(c));
    }

    /// Buy crash cover from `pool` and hold the policy. This now aborts through
    /// `cover_pool::buy_cover`, because the legacy RiskFeed-settled lane is disabled.
    public fun insure<T>(
        m: &mut LendingMarket<T>,
        pool: &mut CoverPool<T>,
        feed: &RiskFeed,
        premium: Coin<T>,
        cover: u64,
        expiry_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(option::is_none(&m.policy), EAlreadyInsured);
        let policy = cover_pool::buy_cover(pool, feed, premium, cover, expiry_ms, clock, ctx);
        option::fill(&mut m.policy, policy);
    }

    /// Claim the held policy's payout into the reserve. Aborts (via `claim`) if the
    /// market has not crossed the policy trigger — that's correct, no free payout.
    public fun cover_shortfall<T>(
        m: &mut LendingMarket<T>,
        pool: &mut CoverPool<T>,
        feed: &RiskFeed,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(option::is_some(&m.policy), ENotInsured);
        let policy = option::extract(&mut m.policy);
        let payout = cover_pool::claim(pool, feed, policy, clock, ctx);
        event::emit(ShortfallCovered { market: m.market, payout: coin::value(&payout) });
        balance::join(&mut m.reserve, coin::into_balance(payout));
    }

    // --- Views ---

    public fun reserve_value<T>(m: &LendingMarket<T>): u64 { balance::value(&m.reserve) }
    public fun is_insured<T>(m: &LendingMarket<T>): bool { option::is_some(&m.policy) }
    public fun market<T>(m: &LendingMarket<T>): String { m.market }

    #[test_only]
    public fun new_for_testing<T>(market: String, ctx: &mut TxContext): LendingMarket<T> {
        new_market<T>(market, ctx)
    }
}
