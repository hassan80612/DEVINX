# Frozen joint future-scenario experiment — 2026-10-12 UTC

User timezone: 2026-10-11, America/Sao_Paulo. Baseline published commit `66c42ff6da4e7af7268a933b9ff83ddfe0b9be90`, Sentinel 13.4.67.2. Isolated research, no deployment.

## Structural change

Previous independent direction/extremum heads contradicted each other. This prototype estimates one distribution over complete, fully observed historical future paths, conditioned on current historical features. No predictions from the published strategy are blended in.

- A supervised randomized classification forest partitions contexts by observed ENTRY-to-EXPIRY direction (PUT/DRAW/CALL).
- Six fixed configurations: depths 3/5, recency half-life 600/1800/infinite seconds; 16 trees; seven randomly sampled non-intercept features per node, thresholds from three historical quantiles; minLeaf=max(12,min(40,round(2.5% of completed examples))); weighted Gini; minimal split gain .001.
- Fixed reproducible random seed 110310. 2% global path prior, 98% conditioned leaf distributions. Raw frequencies are not calibrated future win probabilities.
- Configuration selected by non-draw binary log loss on a purged chronological historical block. Every tuning training outcome precedes validation issue. Final training outcomes must be complete at current issue.
- Choose the more supported non-flat direction, then use only complete paths with that sign.
- Two frozen trajectory representations: conditional mean of normalized log-price paths; and a representative historical path nearest that mean among paths with >=25% of the largest conditional sample weight.
- Current scale and price anchor convert a path to future prices. Entry, expiry, direction, top/bottom price and time and reversal indication all derive from that SAME path. No sign flips, sorting independent prices or moving event times to hide inconsistency.
- Future path contains every second through the chosen expiry. Extrema are measured only inside the future holding interval.
- Numerical direction below displayed price resolution is unavailable, not invented. Stale/missing/all-flat history remains unavailable.

## Frozen evaluation

- New synthetic seeds: 1040027, 1040041, 1040059, 1040073, 1040089, 1040107, 1040123, 1040141. Ten previous generators, new seeds, indices 1850/3300/4700, six horizons; 1,440 forecasts. Shards only parallelize independent evaluations.
- New real dates not used in preceding tests: 2026-09-27, 28, 29, 30; BTCUSDT and ETHUSDT archived spot 1s closes. Eight archives, original checksums verified and recorded.
- Same 3,600 temporal points, issue spacing 1,800s, prediction at T for entry T+H to expiry T+2H. Horizons 5/10/30/60/120/300s.
- Close observable at archive opening timestamp +1000ms. Future quotes/backfills excluded from historical features.
- Full opportunities, draws, coverage, paired accuracy, rescued errors and harmed correct signals, reversals, horizons and every source file.
- Draws never count as wins. Missing predictions cannot make the full-opportunity hit rate look higher.
- Extrema ±10s scored only for H>=30s. Timing and price error reported separately.
- Independently recompute direction/price disagreement, inverted extrema and reversal disagreement from returned numeric values. Verify every event matches its reported path at every forecast.
- Descriptive clustered bootstrap by entire source file, 4,000 samples, seed 921047. Limited file count and hypothesis multiplicity remain limitations.

## Promotion criteria

No automatic publication. Coherence must be exact, but is not accuracy. Need meaningful direction improvement across both assets and multiple dates, no concealed horizon/reversal losses, and useful extremes. If not achieved, report failure honestly and retain 67.2. No retuning to these test results; any future change needs new data.
