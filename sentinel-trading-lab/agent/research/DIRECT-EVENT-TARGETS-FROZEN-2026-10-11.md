# Frozen direct direction and event-target experiment — 2026-10-11

Baseline is the published 67.2 commit `66c42ff6da4e7af7268a933b9ff83ddfe0b9be90`. Research branch only. No production changes or deployment.

## Hypothesis and scope

The preceding regime comparison produced only small improvements. This experiment changes the learned TARGET instead of repeating those context-weighting variants:
- Direction ridge: regress -1/0/+1 for the exact ENTRY to EXPIRY outcome and tune historical direction error, not movement magnitude. A zero score stays unavailable.
- Direction logistic: learn CALL versus PUT directly with regularized logistic regression; tune historical binary log loss. Flat outcomes are excluded from that binary label and counted as draws in external scoring. Raw scores are not calibrated win probabilities.
- Extremum prices: regress the actual maximum/minimum within the future holding interval, directly, using only completed historical outcomes.
- Extremum timing: compare direct conditional mean time against the most likely time bin. Bins have nominal spacing no greater than 10 seconds for horizons up to 300s. Keep separate top and bottom targets.
- Reversal head: learn whether the ENTRY-to-EXPIRY direction opposes the previous 30s direction, using symmetric return-magnitude/interaction features. Compare precision and recall against the baseline's direction-based implicit reversal indication.
- Existing input features for direction/price are unchanged from the published adaptive model. No selected broker strategy or future generator label controls predictions.
- Price/side contradictions, reversed extremum prices and reversal/side contradictions are reported, not silently corrected.

## Frozen parameters and new evaluation data

- Ridge/logistic penalties .02, .2, 2; half-lives max(300,2H), max(900,6H), infinity. Select only on purged chronological historical validation. No history-dependent reported accuracy is described as a future win probability.
- Complete training outcomes must end before the first tuning-validation issue. All final training outcomes must be observable at forecast issue.
- New synthetic seeds 830017, 830039, 830051, 830063, 830089, 830101, 830117, 830141. Ten generators, issues 1850/3300/4700 and six horizons, 1,440 forecasts. Same generator definitions as preceding research but independent seeds.
- New real dates for this research: 2026-10-01, 02, 05, 06; BTCUSDT/ETHUSDT archived spot one-second closes. Not the 03/04/07/08 or 09/10 dates used in preceding comparisons.
- Archive original SHA256 verified and recorded. Close observed at archive bar-open +1000ms.
- 3,600 temporal points for every model, matching one-hour released memory. Issue spacing 1,800s; future interval T+H to T+2H, horizons 5/10/30/60/120/300s.
- Full opportunity counts, coverage, paired wins, rescued errors/harmed correct signals and draws. Never count DRAW as a win.
- Extrema timing tolerance ±10s is scored only for H>=30s to avoid tautological success on 5s/10s windows.
- Descriptive bootstrap by entire source file, 4,000 draws, fixed seed 921047; does not establish broker accuracy or handle model-selection multiplicity.

## Decision rule

No automatic production release. A useful direction candidate must improve across both assets and several dates without hiding horizon or reversal regressions. Usable output also requires consistent direction and displayed prices. Extremum improvements must include event timing and price error without contradictory ranges. Failed heads will be reported separately. No tuning to these test outcomes; further variants require another holdout.
