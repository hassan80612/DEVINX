# Frozen selection-evidence correction — 2026-10-12 UTC

User date is 11/10, America/Sao_Paulo. Baseline published 67.2 at `66c42ff6da4e7af7268a933b9ff83ddfe0b9be90`. Isolated branch, no deployment.

## Code finding

At one-hour history, the existing tuning produces these nominal validation examples versus validation examples with disjoint complete future paths:

| H | Nominal | Disjoint complete future intervals |
|---|---:|---:|
| 5s | 427 | 72 |
| 10s | 426 | 39 |
| 30s | 281 | 14 |
| 60s | 138 | 7 |
| 120s | 66 | 4 |
| 300s | 21 | 1 |

This does NOT prove the model's predictions are wrong. It identifies dependence and potential instability when choosing among nine parameter settings. The paired ENTRY→EXPIRY target alone spans H, whereas the complete path spans 2H in these tests; this experiment conservatively separates the complete intervals. Non-overlap does not imply full statistical independence.

## Four small frozen candidates, same coherent regression targets

- fixed02: no selection; ridge penalty .2 and half-life max(900,6H).
- fixed2: no selection; stronger ridge penalty 2 and same half-life.
- nonOverlap: select by original paired-return MSE, but validation issues must be more than entryDelay+holding apart. Require >=24 such validation cases and >=max(24,featureCount) training rows. Otherwise use fixed02. Every training outcome precedes first validation issue.
- walkDirection: two expanding chronological folds (50–70%, 70–100%), with strict outcome purge and non-overlapping validation across folds. Same minimum 24 independent-interval validation observations. Choose highest historical directional accuracy, then lower paired-return MSE. Ties retain the prior when equivalent.
- Same nine penalty/recency settings as published model, same historical features and continuous trajectory/paired-return targets. No new classifier or independent price head. Linear target identity preserves ENTRY/EXPIRY direction consistency.
- Fixed priors or no tuning do NOT disable forecasts or controls. Historical validation accuracy is never shown as future win probability.

## New evaluation

- Seeds 1210029, 1210043, 1210061, 1210079, 1210097, 1210111, 1210127, 1210149. Ten generators; indices1850/3300/4700; six horizons5/10/30/60/120/300;1,440 forecasts.
- New real archives: BTCUSDT/ETHUSDT,19–22/09/2026. Not dates used in preceding experiments. Original checksums verified and recorded.
- Same 3,600 points for baseline/candidates; bar close available only at archive-open+1000ms. Forecast at T, ENTRY T+H, EXPIRY T+2H. Real issues1,800s apart.
- Full opportunity count, draws, coverage, paired wins, rescued/harmed, reversals, each horizon/file. No missing or flat outcome counted as a win. Alternate non-draw denominator explicit.
- Extrema sampled from the same original trajectory format for baseline and candidates, scored only H>=30 with ±10s tolerance. No claimed new extremum architecture.
- Existing original forecast, worker, layout, mobile and downloads byte-identical. Four causal/evidence tests plus per-case checks. Candidate selection and test datasets frozen before observing results.
- Descriptive bootstrap across entire source files, 4,000 draws, seed921047. Small source count and multiple-hypothesis limitations disclosed.
- Parallel shards only change execution time; each forecast is independent, deterministic and receives the same exact history.

## Decision

Do not publish automatically. A credible next candidate must show a meaningful improvement across both assets and multiple dates, with no hidden horizon/reversal regressions and no extra load. Report all four results, including failures. No retuning to these outcomes. If unsuccessful, preserve 67.2.
