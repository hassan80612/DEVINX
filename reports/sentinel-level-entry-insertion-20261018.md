# Research-only signal insertion at weak level points

Production reference: 13.9.36 / a6e810400ecf1d909293d80818aa6282f5e81569. No published code, installer, database or real order was changed.

This is a causal event study of hypothetical new 30-second entries, not a full replacement-runtime A/B against the published engine. It deliberately bypasses the engine's forecast/admission conflicts to answer what happens when a signal is inserted at these points. The opposite direction is tested at exactly the same entry price, timestamp and expiry, never chosen after observing the outcome.

## Fixed detection rules

1. Slowing approach to a tested historical level: the approach over the prior four seconds exceeds the released reaction noise floor; the latest two seconds still approach but move less than one quarter as far. The nearest eligible wall lies within the released tolerance and has at least two touches. Compare continuing the approach with returning away from the level.
2. Detected level rejection: the released historical reaction detector produces a rejection and its own opposing-level check passes. Compare following that reversal with continuing the approach. The detector remains unchanged, including its previously identified possibility of an older touch preceding the six-second origin. Such cases are labeled separately rather than silently corrected.
3. Detected level breakout: the same released detector identifies a held crossing and fresh movement through the level. Compare continuing through the level with reversing it.

No threshold was fitted to the resulting outcomes. Only received quotes at or before entry and actually closed/received historical candles are used. Historical structure uses the released cache. Source exits are read only after entry selection and use the existing as-of-complete-bid-stream scorer. Each series allows one immutable entry for 30 seconds and requires a later quote after expiry.

## Results

14 already-inspected half-hour windows from EUR/USD bid data on 2020-03-30. These are external Forex data, not Exnova/IQ Option OTC or the user's current session. The quote-only known-video extractions lack verified historical candle inputs for this detector and are excluded. Screenshots cannot reconstruct the requested entries' full pre-entry streams.

| Point | Continue the approach | Reverse the approach | Completed results |
|---|---:|---:|---:|
| Slowing approach near level | 121/268 = 45.15% | 147/268 = 54.85% | 268 |
| Detected rejection | 249/478 = 52.09% | 229/478 = 47.91% | 478 |
| Detected breakout | 75/144 = 52.08% | 69/144 = 47.92% | 144 |

There are respectively 10, 14 and 4 unchanged ties, excluded from the hit-rate denominators; no exits are missing. Categories are independent series and may overlap each other, so their counts must not be summed. A separately run combined series chooses a detected reaction ahead of a simultaneous slowing approach, with one shared 30-second lifecycle: following each event's indicated side yielded 238 wins/265 losses (47.32%) and reversing each side 265/238 (52.68%), plus 23 ties.

Among the rejection series' 492 total entries, 475 have a touch in the actual current approach and 17 have only an older qualifying touch in the broader context. This is diagnostic, not a post-hoc selection rule.

Eight deterministic tests pass for mirrored slowdown, rejection and breakout directions, future/not-yet-received quote exclusion, stale/unverified quotes and future historical structure. Replay assertions verify opposite outcome identities and non-overlapping immutable expiry windows within each series. Tests validate mechanics, not accuracy or profitability.

The tested points do not produce a reliable high-accuracy rule. Reversing the slowdown case modestly improves its retrospective hit rate, while a generic level rejection does not reliably predict a 30-second reversal in this sample. All windows were already known, all come from one day, and no broker execution, latency or settlements were modeled. These observations do not establish a gain over production and do not justify publishing a new rule.

## Reproduce

Run `node --test tests/sentinel-level-entry-points.test.mjs` and `node scripts/sentinel-level-entry-insertion-20261018.mjs` after regenerating the external fixtures with the existing preparation script. The JSON report retains every event, causal entry time, level, entry/exit price and paired outcome.
