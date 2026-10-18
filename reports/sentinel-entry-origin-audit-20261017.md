# Audit of unchanged 13.9.36 entry origins

The production engine and deployment were not modified. The audit traces temporary copies of commit a6e810400ecf1d909293d80818aa6282f5e81569. Every traced replay has exactly the same entry timestamps, directions, prices, expiries and scored outcomes as the released runtime. Only original past/received input is used for flow classification; outcomes are read separately after the entry lifecycle returns.

The three new screenshots show in-progress entries, not their settlements. They do not provide the pre-entry quote/candle stream or decisive model reason. No screenshot was reconstructed from invented ticks and no particular loss is claimed to have been diagnosed from it.

The public external EUR/USD tick windows are from 2020-03-30, a single trading day unrelated to the user's broker or OTC session. They were already inspected in prior research. These descriptive categories do not constitute an independent holdout or a validated accuracy improvement. The two video extractions describe the same known source, not two independent sessions.

| Final entry origin, external windows | Wins | Losses | Ties |
|---|---:|---:|---:|
| break-retest-continuation | 13 | 3 | 0 |
| failed-breakout-structure-change | 10 | 6 | 0 |
| historical-level-rejection | 43 | 41 | 2 |
| multiscale-candle-rejection | 27 | 37 | 1 |
| causal-expiry-analogue | 8 | 15 | 1 |
| closed-structure-and-live-impulse | 4 | 10 | 0 |
| historical-level-breakout | 7 | 4 | 0 |
| closed-range-extreme-reversal-confirmed | 3 | 7 | 1 |

The projected-direction override is not a general explanation for these external losses: only one external entry had a changed base direction, and that final entry was not even retained in the projected direction. In the fine known-video replay the retained projection change had 4 wins/2 losses; a blanket prohibition would remove useful decisions too.

Following unanimous 5/10/20s net price direction was not a reliable separator: external aligned entries total 39 wins/38 losses (2 ties), opposed entries 11/12. This is directional classification only, not a strength/confirmation or live-accuracy claim.

The local impulse and multiscale rejection categories deserve targeted investigation; breakout/retest had 13/3 across only sixteen completed external entries. That small sample is insufficient to claim general 81.25% accuracy, to promise 90%, or to justify disabling the other paths. Category counts are NOT results of a filtered-strategy replay. Blocking entries changes subsequent opportunities and must be tested through the full lifecycle. Subgroup loss streaks in JSON refer to the category subsequence, not the full entry stream.

Reproduce by downloading the hash-checked public source described in sentinel-external-data-provenance-20261017.json, running node scripts/sentinel-prepare-external-ticks-20261017.mjs, then node scripts/sentinel-entry-origin-audit-20261017.mjs. Existing video fixtures are included in the production repository. External generated fixtures are reproducible intermediates.
