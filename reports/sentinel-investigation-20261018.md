# Sentinel 13.9.36: continuation, rejection and inverse-signal investigation

Production remains unchanged at the released 13.9.36 reference a6e810400ecf1d909293d80818aa6282f5e81569. The 111 Agent source/payload files were checked against the installer archive and remain byte-identical. All candidates are temporary copies and are not connected to the production worker. No real orders, broker clock lookup, database change, or growing runtime history was introduced.

## Continuation confirmation

A deterministic CALL/PUT example reproduces continuation admission from a six-second directional move even after the latest quote already moved the other way. The candidate requires a three-second net move and the current step to agree. It reuses existing range-turn timing constants, adds no timer, and affects only the 30s impulse path. Two integration points were tested before/after the broader decision chain. Both behaved the same in these runs.

Nine unit tests pass for mirrored paths, current movement, causal/fresh data and immutable 30s expiry. However, the fine known-video result regressed from 11/3 to 10/3. In four newly reserved external windows, 09 UTC regressed 24/26 to 22/27 and 18 UTC 17/7 to 15/8; 12/15 UTC were unchanged. Eight synthetic stress families retained their baseline outcomes. This candidate is rejected: a last counter-tick or pause does not establish exhaustion, and a pure recency gate loses working entries.

## Ordering of rejection evidence

Both historical-level and multiscale-candle rejection calculations can combine a six-second approach-origin price with an extreme/touch from the wider twelve-second context that occurred before that origin. Controlled examples reproduce an older touch being recognized as a current rejection. The research candidate restricts rejection extrema to observations since the actual approach-origin quote, retaining existing tolerances and breakout logic. Seven unit tests pass for stale/fresh mirrored touches, true breakouts and future/late-input exclusion.

Full replay preserves both known-video entry lists. In the 10 exploratory external windows, totals changed 202 wins/211 losses to 200/206; two windows regressed. In four windows reserved before this candidate was implemented, 11 UTC improved 23/23 to 25/20, while 13/17/20 UTC were identical. Reserved aggregate changed 76/85 to 78/82. All are from one already-known external Forex trading day, not independent days or broker OTC results.

Forty of forty-two existing historical/level/selector integration tests passed against this candidate. Two controlled selected-forecast tests fail because their expected reaction is no longer produced. The original tests were not edited to hide those failures. The interaction between removing a stale reaction and allowing or vetoing the original forecast therefore remains unresolved. This is not ready for publication, and the small aggregate gain does not establish a reliable accuracy improvement.

## Inverting every signal

The inverse-signal audit independently rescored each original entry from the underlying quote source, retaining the exact entry bid and timestamp and 30-second deadline. It swaps CALL/PUT only; engine admission and learning remain unchanged, as when a user externally follows the opposite direction. Every saved original outcome was verified against source prices. Ties and missing exits remain unchanged.

| Data | Original | Inverse |
|---|---:|---:|
| 14 external windows, one Forex day | 278/296 (48.43%) | 296/278 (51.57%) |
| Fine known-video extraction | 11/3 (78.57%) | 3/11 (21.43%) |
| Coarse extraction of the same video | 10/3 (76.92%) | 3/10 (23.08%) |

External percentages exclude 18 ties; no external exit is missing. Each video extraction has one missing exit excluded. The two video extractions are the same source, not independent evidence and must not be summed. Inverse video loss streaks are seven/eight versus two in the originals. These are retrospective quote-direction outcomes, not executed trades, profits or current user accuracy.

Inverting a below-50% completed directional sample increases its historical hit rate algebraically, but this audit does not establish a consistent inverse advantage across contexts. No inverse mode was deployed.

## Reproduction

The hash-checked external preparation script now includes all 14 windows. The 09/12/15/18 UTC windows were reserved before the continuation candidate, and 11/13/17/20 UTC before the ordered-rejection candidate. They are now known and must not be reused as untouched holdouts. Source provenance and MIT attribution are retained. Generated multi-megabyte fixtures can be regenerated and are not required as committed deliverables.

Run node scripts/sentinel-prepare-external-ticks-20261017.mjs, the two candidate A/B scripts in their development/holdout/stress modes, node --test tests/sentinel-current-impulse-confirmation.test.mjs tests/sentinel-ordered-rejection.test.mjs, node scripts/sentinel-ordered-rejection-existing-tests-20261017.mjs, and node scripts/sentinel-inverse-signal-audit-20261018.mjs. The existing-tests runner intentionally reports its current two candidate failures.
