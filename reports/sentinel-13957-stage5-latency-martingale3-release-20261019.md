# Sentinel 13.9.57 — release: verified mechanics, not verified profitability

Date: 2026-10-19. Based on production 13.9.56 `ad23054fdcae1098835f56c15a9528f0ef97e28a`.

## User incident

The real-money session began with USD 16.86 and the user subsequently reported the bankroll was exhausted. Trade-by-trade data and independent broker entry and settlement prices were **not** provided in this incident; consequently the win/loss ratio, direction error cause, and PnL decomposition **cannot be established** from this report. The user previously reported many losing sessions, including before Martingale.

## Corrections

1. **Stage 5 (closed-candle level priority):** `candle-level-map.mjs` now ranks independently confirmed closed-candle rejections ahead of a slightly closer unconfirmed price-level event. Previously an unconfirmed nearby rejection could prevent an otherwise valid confirmed reversal. Confirmed `PUT` scenario reproduced with two nearby resistance zones. Do not infer any unconditional reversal from mere price proximity.
2. **Stage 6 (stale entry protection):** `signal-executor.mjs` now discards unexecuted CALL/PUT signals after 500 ms for 5-15s expiries, **900 ms** for 30s, and preserves 1500ms for longer expiries. `broker-ui-executor.mjs` batch feasibility uses the same budget; delayed entries do not become orders and do not stop the bot.
3. **Broker response overhead:** HTML CALL/PUT button resolution is cached for at most 1200 ms on the **same browser page, symbol and active instrument ID**, and both mapped buttons are rechecked for uniqueness, visibility and enabled state before reuse. Missing/stale controls force re-discovery. Canvas handling is unchanged. This removes repeated full-frame scans during multi-click sequences; it cannot speed up the broker's network or underlying trading platform.
4. **Martingale limit exactly 3 progressions:** allowed max is **3 levels** for 1 → 2 → 4 → 8 clicks and **return to 1** after the last fully settled batch, win, or configured progression termination. Agent, local panel, and mobile settings all enforce the cap. On startup, old saved settings specifying levels 4–10 are reduced to 3 while retaining other settings.
5. Existing **stop-loss** and insufficient-balance stopping rules, confirmed broker-order reconciliation, and direction hold/30s countdown remain unchanged. Do not disable the stop-loss as a workaround for losses.

## Tests and release

- All focused stage5, broker-latency, executor and multilingual dashboard tests passed.
- Complete Agent and site prebuild regression tests passed. One obsolete test that configured an unsupported fourth Martingale level was updated to three without changing the test's reset/stop expectations.
- Windows EXE and alternate offline ZIP were compiled and verified against exact current Agent source, update manifest, embedded payload, HTTP download and HTTP Range 206.
- Production: Vercel deployment `dpl_8tuQm2jwbAukATxiUFubgL8RdGra`, source/build SHA `4921e00b278f9ed448b940bdd1ee971b1c10d10b`, **READY**; aliases `trading.devinx.com.br`, `sentinel.devinx.com.br`, and `sentinel-trading-lab.vercel.app`. Download integrity workflow ID `39345016840` completed successfully.
- Rollback: version 13.9.56, production deployment `dpl_DUHHUZEQET7adUyCwLLuvQChnH92`. No automatic bot start, no trade, no bankroll refill.

## Key unresolved limitation

Mechanical correctness **does not demonstrate** trading advantage. The actual broker can accept an order later and at a different price from the initial signal. Analyst `vnext.outcomeQuality` measures observed quote-direction outcomes; only identified broker order settlements establish executed-trade results. No meaningful empirical improvement or reduced drawdown was demonstrated on unseen real-market sessions. Validation should occur in a demonstration account with synchronized quote/signals, order accepted timestamp/price, actual broker expiry/settlement, and payout.

User-requested risk rule remains operationally dangerous: 3 Martingale levels permit up to 8 simultaneous fixed-value orders after three consecutive losing sequences, and four losing sequences can expose an aggregate 15x base stake. The stop-loss does not imply guaranteed preservation of funds, because execution and settlement can lag.
