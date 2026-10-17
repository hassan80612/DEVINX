# Entry moment research — 2026-10-17

Status: research only. No production source, release version, installer, database or deployment was changed. The production reference is commit `406c8f6b7ffa6fa90cad6575c0903ba78205b697` (13.9.35).

The user requests integrated accuracy improvement without damaging working entries, and now allows moderate waiting for a genuine candle/price event. There is no demonstrated 100% entry instant and no measured 90% accuracy gain. The candidate below is rejected for release.

## What was implemented

`experiments/candle-entry-moment-20261017.mjs` qualifies the existing direction on an actual fresh price crossing: breakout/retest/resumption, wick rejection/body reclaim, body pullback/resumption, or opposite-body reclaim. It requires verified closed candle context, uses only received past quotes, and never flips the direction, backdates the entry, shortens the 30-second holding time, or releases a remembered expired crossing. Current quote and event freshness are at most 1450ms. Thresholds were fixed before the additional windows were inspected. No fixed entry second or training timer was added.

The wrapper creates a temporary copy of the production core; the deployed files remain unchanged. Candle-moment confirmation adds no accumulated history and consumes the already bounded working set.

## Correctness finding: price history sampling

The released 30-second projection samples a one-second grid anchored to the current quote. It accepts a historical quote only within 500ms before a grid point. On an otherwise identical valid 1Hz history, a current quote at +250ms produces a projection while one at +750ms discards nearly all historical points. This is reproduced by a regression test. It can change projection availability independently of price behavior.

The isolated correction uses one actual observation per absolute second bucket, retaining the observation's true timestamp. It does not fill missing seconds, interpolate prices, change live quote freshness, or accept genuine gaps. Sixteen focused tests pass across sampling, causal data access, mirrored CALL/PUT events, quote freshness and immutable 30-second lifecycle.

Sampling alone preserved all entries and outcomes on both extractions of the known video and on four nonempty external windows. One previously inspected external window improved from 20 wins/33 losses to 22/31. The two additional nonempty reserved windows were unchanged. This is a correctness improvement, not evidence of a general accuracy increase.

The alternative historical tolerance `<1000ms` regressed that same inspected window to 20/34 and a worse loss streak; it is not selected as an accuracy improvement.

## Complete replay comparison

External data: the public Dukascopy-node EUR/USD bid tick example from 2020-03-30, with hashes, attribution and window definitions in `sentinel-external-data-provenance-20261017.json`. These are not the user's broker, OTC session, native broker candles, or executed trade settlements. Closed 1m OHLC is aggregated from source ticks. All six windows come from the same day. The first three were previously inspected; the last three were reserved before the sampling run, and are now known. The candle-event thresholds were not retuned to their outcomes.

The full production validation gate and one-entry-at-a-time expiry lifecycle run causally on actual observation timestamps. Scoring separately looks up the last published bid at or before the deadline in the complete source stream. It does not feed future prices into analysis. The old sparse quote-only video retains its explicitly approximate first-after-expiry scoring and has no candle evidence to validate this selective entry feature.

| UTC window | Released wins/losses | Candle event wins/losses | Candle event + corrected sampling | Longest gap between selected entries |
|---|---:|---:|---:|---:|
| 08:00 | 27/27 | 9/4 | 9/4 | 356s |
| 14:00 | 20/33 | 7/4 | 7/4 | 333s |
| 19:00 | 21/22 | 2/4 | 2/4 | 446s |
| 10:00 | 21/19 | 3/3 | 3/3 | 261s |
| 16:00 | 24/24 | 0/4 | 0/4 | 715s |
| 21:00 | No entries | No entries | No entries | — |

Ties are excluded from wins/losses and retained explicitly in the JSON reports. No external outcome is missing with the complete-stream as-of scorer. Zero entries do not establish accuracy. Maximum inter-entry gaps do not measure initial startup or analysis CPU latency.

The 8-family synthetic stress replay also confirms suppression of working setups: a trend path changed from 30 wins/0 losses to only 1/0; random-walk from 14/15 to 6/7 and volatility-switch from 11/18 to 3/7. These are synthetic behavior checks, not measured market accuracy. Nine existing history-retention and candle-source tests also pass.

The candle candidate improves some inspected windows but regresses others, including an additional reserved window. It also suppresses many otherwise successful trend entries and leaves excessive gaps. Combining it with corrected sampling did not remove these failures. Therefore it must not replace production.

An even stricter candidate requiring a valid agreeing 30s projection plus a candle event produced no entries. A diagnostic probe found genuine >3s gaps in the raw external source frequently make the projection unavailable. Empty operation is not a successful filter and is not evidence of zero risk or perfect accuracy.

## Other exploratory candidates retained

Direct fitted future-price level and a residual-persistence correction regressed the known video (see `sentinel-forecast-level-ab-20261017.json`). A weighted-median analogue/short-flow confirmation failed to improve consistently across the two video extractions (see `sentinel-confirmed-binary-ab-20261017-development.json`). Neither was released.

The earlier standalone candle reports and binary report used the old first-after-expiry scorer on external data. Their external figures are superseded for decision-making by the complete-stream as-of reports. Do not compare old external counts with current counts as if they were the same metric. The script now uses the corrected scorer when fixtures declare it; re-running old scripts can therefore change those old external totals.

## Reproduction

From the recovered project root:

```sh
mkdir -p ../research-data
curl --fail --location 'https://raw.githubusercontent.com/Leo4815162342/dukascopy-node/master/examples/with-tick-data/with-tick-data.output.json' --output ../research-data/dukascopy-eurusd-example.json
node scripts/sentinel-prepare-external-ticks-20261017.mjs
node --test tests/sentinel-observed-sampling.test.mjs tests/sentinel-candle-entry-moment.test.mjs
node scripts/sentinel-observed-sampling-ab-20261017.mjs
SENTINEL_SAMPLING_SET=validation node scripts/sentinel-observed-sampling-ab-20261017.mjs
node scripts/sentinel-candle-sampling-combined-ab-20261017.mjs
SENTINEL_COMBINED_SET=stress node scripts/sentinel-candle-sampling-combined-ab-20261017.mjs
```

Preparation verifies exact source Git blob SHA-1 `7df560b3561aa644e10ea04a39947bb992cdff2d` and records SHA-256 `df4c6d7b089c46b73545eb5e9a5207c1ee40ce7375aaa5ba318d1f7963670403`. If the upstream example changes, hash verification fails rather than silently testing different data. Attribution is retained in `tests/fixtures/external/LICENSE.dukascopy-node`. Generated fixtures are reproducible intermediates; the full external dataset need not be committed.

The research does not establish improved live accuracy. The release decision is to preserve the current production engine and not publish a selective-entry regression.

The standalone sampling patch is preserved at `patches/sentinel-13935-observed-timestamp-sampling.patch`; it passes a dry application against the production source. This patch is separate from the rejected candle-timing hypothesis. The three local production core files were matched by Git blob SHA-1 to the deployed reference commit (runtime: `503a9c30bfacfb63ad0e920bce03b4f249a36471`; opportunity engine: `4a7be41f9e188b0fdfad7b2b2494bce89c13ac40`; 30s projection: `2c59070dbd6f2628a1ed664e7826df1584c8721c`).
