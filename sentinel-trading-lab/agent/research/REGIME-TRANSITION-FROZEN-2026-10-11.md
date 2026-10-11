# Frozen regime and transition investigation — 2026-10-11

Baseline: exact published Sentinel 13.4.67.2 commit `66c42ff6da4e7af7268a933b9ff83ddfe0b9be90`.
Research-only branch. No deployment, broker access, new trading permissions, runtime import, UI or installer changes.

## Code finding

The released model learns one linear ridge relationship over all completed examples. It includes lagged returns, acceleration, range position, efficiency and a volatility ratio; it does not learn explicit interactions between these variables or condition sample weights on the current regime. It chooses recency and ridge penalty using one purged chronological validation block. This supports a testable hypothesis, not proof that regime separation will improve forecasts.

## Frozen hypotheses before observing benchmark outcomes

1. Similar context: retain the original predictors and give more weight to completed samples with similar signed efficiency, return transition, serial dependence, turning frequency and volatility ratio. A continuous kernel avoids hard regime switches. Minimum relative sample weight 0.1.
2. Transition features: add continuous interactions of momentum, acceleration, range position, efficiency, volatility and serial dependence. Same nine penalty/recency settings as the baseline.
3. Adaptive choice: select global, similar or transition using completed purged historical validation MSE; require 5% relative MSE improvement to change the choice. This threshold is not a win probability.
4. Global control: reimplementation must reproduce exact baseline direct paired returns and sampled trajectories in every benchmark case.

Context labels are descriptive causal diagnostics, not future truths. Synthetic generator kind is recorded only AFTER prediction for scoring.

## Evaluation fixed before running

- Independent synthetic seeds 710027, 710041, 710053, 710069, 710083, 710101, 710119, 710137.
- Ten generators: prior eight modes plus unpredictable regime switches and gradual trend exhaustion.
- Six horizons 5, 10, 30, 60, 120, 300 seconds; issues at indices 1850, 3300, 4700; 1,440 comparisons.
- New real archives: BTCUSDT and ETHUSDT, dates 2026-10-03, 04, 07, 08. These dates were not used in the preceding Sentinel comparison.
- Original archive ZIP checksum verified. CSV close timestamps shifted +1000ms from bar open; no current bar close before observable.
- 3,600-point temporal history, matching the released one-hour memory at one-second resolution. Same windows for every candidate and baseline.
- Issues 1,800 seconds apart. Each prediction at T forecasts price(T+H) to price(T+2H). No truth label passed to a candidate.
- Draws are not wins. Report full opportunities, coverage, alternate non-draw denominator, rescued errors, harmed correct forecasts, reversals and every horizon/file.
- Extrema: top/bottom only within entry-to-expiry interval, ±10s timing and basis-point price errors. Eight sampled forecast points for all variants. This metric measures sampled-path quality, not actual trading receipts.
- Descriptive bootstrap by source file (4,000 draws, seed 919021), respecting correlation among horizons of the same issue. Only eight external file clusters, so intervals are limited evidence.

## Decision

No automatic publication even if aggregate improves. A credible next candidate needs improvement on both assets and multiple days, a positive paired gain not explained by the sampled uncertainty, and no concealed horizon/reversal regressions. Report failed hypotheses. All three candidates frozen before test; do not retune on these results. Further changes require new holdout dates/seeds.

References: QuantConnect research guide and regime/HMM documentation; scikit-learn TimeSeriesSplit. The prototype uses continuous observed-context features, not an HMM, and never uses retrospective smoothed regime probabilities.
