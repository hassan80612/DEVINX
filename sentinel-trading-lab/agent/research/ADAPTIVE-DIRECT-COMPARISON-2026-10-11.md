# Sentinel: independent Adaptive Direct Trajectory versus 13.4.67.1

User goal: a new motor that anticipates future direction and reversals, preserving 67.1. User reports approximately 53% accuracy in current use. That is an observation without an available denominator or controlled price replay; it is not substituted for the measured baseline below. No request for the user's history is required by this study.

## Preserved reference

- Original version: 13.4.67.1.
- Immutable reference commit: `431bd6ffc276015a6581e0d6ba7a56c244de72e9`.
- Build: `13.4.67.1-expand-panels-ui-only-1011`.
- Nine original imported motor modules have the same exact Git blob hashes as 13.4.67. UI, executable, downloads, release, production runtime and database were not changed.
- Automated verification of all protected production paths passed.

## New motor

`agent/src/core/adaptive-direct-trajectory.mjs` is a complete independent model, not a correction of 67's predictions or a vote between nine motors.

It samples the history in seconds, learns multiple future-price points and the direct ENTRY->EXPIRY return from already completed historical examples, and chooses its memory half-life and regularization using purged chronological past validation. The final output uses the same current context across all trajectory targets. Lead and holding duration are distinct inputs. Causal quote availability uses actual receipt time; a late backfill cannot rewrite features that were unavailable at historical issue time.

Outputs include CALL/PUT direction, issued/entry/expiry timestamps, expected entry/exit prices, sampled trajectory, sample range and tuning diagnostics. Historical validation accuracy is explicitly NOT presented as a future win probability. No forced percentages, orders, production UI integration, or use of 67's forecast inside the candidate.

Insufficient context is disclosed instead of a fabricated prediction. At 1Hz, the minimum history is roughly max(180, 2*holding, capped at 600) + lead + holding + 40 seconds, with enough completed examples. No long-horizon coverage failure occurred in the measured benchmark. Production integration and broker execution testing are not claimed.

## Verification

Eight Node tests passed locally and in GitHub Actions at code commit `58b31ffa713b57d6948a1e834768315c9cfe7e7e`.
Final full automated job: https://github.com/hassan80612/DEVINX/actions/runs/38181607723

Tests cover separate lead/holding, future and late-arriving quotes, repeated tick-density invariance, stale/missing input, immutable past forecasts, backfill-only history, and current quotes actually received at issue. The old 67.1 and the new model receive exactly the same history, issue time, entry time and expiry time.

## Comparative results

Target: issued at T, predict price(T+H) to price(T+2H), H=5/10/30/60/120/300 seconds. These results do not score current-price->future-endpoint as the future-entry operation.

| Data | 67.1 | New | Coverage |
|---|---:|---:|---:|
| Eight previously unseen synthetic streams/seeds across eight regimes, 768 opportunities | 509/768 = 66.28% | 511/768 = 66.54% | 100% both |
| Real external BTC/ETH archived 1s closes, 1104 opportunities including 181 unchanged-price outcomes | 462/1104 = 41.85% | 490/1104 = 44.38% | 100% both |
| Same real comparison, direction-changing outcomes only, 923 observations | 462/923 = 50.05% | 490/923 = 53.09% | Descriptive alternate denominator |

The alternate denominator is reported transparently; it is not used to select or approve the model. Neither evaluation is the user's approximately 53% broker result. External prices are Binance spot, NOT IQ Option OTC or Xnova, and price direction is not a broker execution receipt or payout calculation. Archived close timestamps are shifted by one second from the recorded bar open to avoid using the close before it was observable. Archive checksums passed. Forecasts are spaced 1800 seconds apart; horizons sharing one issue remain correlated.

| Horizon | Synthetic 67.1 | Synthetic new | External real 67.1 | External real new |
|---|---:|---:|---:|---:|
| 5s | 61.72% | 66.41% | 29.89% | 29.89% |
| 10s | 67.19% | 75.78% | 34.24% | 37.5% |
| 30s | 75% | 67.19% | 40.22% | 42.93% |
| 60s | 65.63% | 64.06% | 46.74% | 55.43% |
| 120s | 64.06% | 58.59% | 49.46% | 49.46% |
| 300s | 64.06% | 67.19% | 50.54% | 51.09% |

Synthetic regime highlights (not transferable to live broker):
- Cycles: 90.63% -> 96.88%.
- Recurring reversals: 75.00% -> 87.50%.
- False breakouts: 51.04% -> 68.75%.
- Random paths: 56.25% -> 36.46%, an important regression.
- Trend: 84.38% -> 81.25%, another regression.

External prices: 215 incorrect baseline directions were corrected, while 187 correct baseline directions were harmed. Aggregate improvement is 28 additional correct directions across 1104 opportunities. This is a SMALL gain, not proof of robust predictive skill or 80% accuracy. Results in different assets/days regress in some cases; the candidate is NOT approved for production.

## Decision

CREATED AND COMPARED; KEEP SEPARATE. Preserve 67.1 and do not publish the candidate. The requested good/80% accuracy has NOT been demonstrated. No user-history upload is a requirement for continuing independent research. Do not claim that contract tests passing or isolated synthetic reversal accuracy meet the operational objective.

## Reproduction

```bash
node --test tests/sentinel-671-adaptive-direct-trajectory.test.mjs
node scripts/sentinel-adaptive-real-comparison.mjs /path/to/original/one-second-csv-archives result.json
```

The workflow downloads checksum-verified BTCUSDT/ETHUSDT archives for 2026-10-09 and 2026-10-10 and produces a result artifact. It contains no deploy command.

Full metrics: `ADAPTIVE-DIRECT-COMPARISON-2026-10-11.json`.
