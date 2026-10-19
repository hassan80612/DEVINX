# Sentinel 13.9.55 — why the decision can be wrong even before Martingale

**Date:** 2026-10-19. Read-only audit of exact published Agent code at commit `d7294b75c3aaa1ce4471acaeb96b86c920cd3836`. No bot, trading, or production changes.

## Main facts about the decision

1. The automatic 30-second engine obtains a structural/analogue decision. Then `now-opportunity-engine.mjs` line 179 applies `forecast?.ready&&original.ready?{...original,...forecast}:original`, replacing the historical side with an extrapolated harmonic trend/cycle sign **without comparing their prior out-of-sample accuracy**. Historical level rules may later veto or modify the signal; therefore a forecast is influential but not the sole decision maker.
2. `thirty-second-expiry-direction.mjs` lines 49–65 fits a line plus a single period of 12–90 seconds using the most recent ~180 seconds, selects via an in-sample penalized fit, then determines CALL/PUT from the sign of the extrapolated +30-second move. It declares 'ready' at a non-zero movement threshold of only `1e-12`. There is **no calibrated threshold for confidence, spread, payout, regime-shift risk, or expected edge** in that ready verdict. This is not evidence of future direction reliability.
3. `completed-expiry-direction.mjs` lines 7–53 adaptively compares **two harmonic projections** (narrow and wide search periods) via exponential error averages, not a direct comparative contest against closed-structure trend, no-trade, and independent real outcomes. These outcomes may also overlap because the selector enqueues a candidate every 5 seconds for a 30-second horizon.
4. `causal-pattern-direction.mjs` is not broken by object arithmetic: `at(rows,time)` returns a numeric quote price. Its training examples for a 30-second expiry are selected at 4-second spacing from a 180-second window; neighboring examples overlap and are **not independent evidence**.
5. A broker-loss session and a bot bankroll drop do NOT reveal the actual win/loss ratio of the analyst: payout less than 100%, stake sizes, Martingale and signal coverage must be accounted for. The user's observation of recurring poor calls prior to Martingale is an independent important report, but session timestamps/quotes are not stored in this repository.

## Exact 13.9.55 executable decision replay, no look-ahead

Replay script `scripts/sentinel-13955-decision-fault-audit.mjs`, GitHub Actions `.github/workflows/sentinel-13955-decision-fault-audit.yml`. The same 9-minute EUR/GBP OTC video was sampled twice (500ms and 1s) on 2026-10-16; those are NOT independent market sessions. Every predicted side uses only past quotes, with expiry label obtained later at +30 seconds. These predictions are reconstructed chart-quote decisions, not actual broker positions.

| 500ms observations / same 9min clip | Wins | Losses | Unknown |
| --- | ---: | ---: | ---: |
| Production final 13.9.55 | **11** | **3** | 1 |
| Reverse every call/put at same times | 3 | 11 | 1 |
| Structural/analogue base at same times | 9 | 5 | 1 |
| Pure cycle when ready | 9 | 4 | 2 |
| Last 5s momentum when observed | 7 | 6 | 2 |
| Only when base and cycle agree | 8 | 1 | 6 |

**Five** emitted predictions disagreed between base and harmonic cycle; **two of the three final errors** were among those five conflicts. However, **three of those conflicts were won by overriding the base**, so always following history is not a cure. One incorrect final decision had both base and cycle wrong.

The 1Hz downsample of **the same clip** gave 10 wins, 3 losses, one unknown (inverse: 3 wins, 10 losses), which shows **sensitivity to quote sampling** and must not be reported as an independent replication.

## Diagnosis and minimum next validation

- The motor can report a confident-sounding binary CALL/PUT without empirically proving that the projected +30s return will exceed noise. Forecast model selection is based on backward **fit**, not on held-out **predictive correctness**.
- The weakness can be **regime mismatch**: a wave that fits the last 180s may change direction in the next 30s, and recent candle momentum offers no reliable correction. This is a mechanism, not a proven explanation of the Oct 19 US$15 → US$4 incident.
- A global inversion is NOT supported by the only exact 13.9.55 saved video. A narrow conservative 'agreement only' policy looked better **on that same example** but excluded 5/15 signals and is not independent validation.
- To *establish* the cause for today's poor live session, capture synchronized signed CALL/PUT decisions and independently timestamped broker quotes/30s expiration outcomes from the **same** recent session. Classify by trend, pullback, reversal and volatility. Evaluate same-time counterfactuals, payouts and drawdowns. Keep separate chronological calibration/evaluation sessions. Test a nonparametric 'no clear directional edge => no entry' policy rather than manufacturing confident calls from near-zero projections.
- DO NOT publish a direction-inversion, threshold adjustment or '90% accuracy' claim on this evidence. Do not use new real funds to test these hypotheses.

## Corrections from earlier assistant statements

Earlier claim that the historical analogue used price objects in arithmetic was incorrect; source `at` already returns `rows[i].price`. The loss complaints predate Martingale, introduced on October 19; Martingale can increase drawdown but is NOT the origin of those previous bad predictions.
