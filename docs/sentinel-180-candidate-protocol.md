# Candidate: continuation clearance, production stays at 179

Base: published 179, e29275eb4a30039b02817fe0985985aca3c92f24 (tree 4a020041496968b24179c96bc8079452cb8b0ae2). This is an isolated candidate, not an approved release. The user explicitly accepts sacrificing some WIN entries if the avoided LOSS entries justify that cost.

## Final candidate rule

Only historical-level-breakout on 30s/1m additionally uses the existing direct clearance review. Current direction must still be supported by the existing six-/two-second price measurements. The opposing wall must have at least one role-correct pivot and two independent rejections, lie at or ahead of the entry price and be within the existing roomNeeded calculation. Deceleration is no longer necessary for this check in this family. All constants, ordinary impulse qualification, candle/quote freshness, established reversal checks, five-minute policy, price confirmation, lifecycle, execution, expiry and UI remain unchanged. Already cleared walls are not retrospectively counted as obstacles. There is no queue, retest requirement, fixed waiting period, 40-second cutoff, inverse trade or probability override.

The design arises from a concrete gap in the existing wall review, not selection of individual order identifiers or results. An initial scope including closed-structure-and-live-impulse was evaluated and rejected: on the full 137-decision upload it withheld seven recorded LOSS and six WIN. The final scope is limited to historical breakouts, which had the strongest observed concentration of failures. This scope revision followed that comparison; it is exploratory and must not be presented as a blind result. No numeric threshold was optimized to the outcomes.

## Validation boundaries

Replay the exact same decision-time observations through unmodified 179 and the candidate; include input timestamps/receivedAt and never pass settlements/future quotes into decisions. Report all differences in admission and side. Annotate original settlements only after both decisions. Separately report the two 179 sessions, the complete 177/178/179 upload and older available 160/164/167/168/170 recordings. These are snapshot comparisons, not a simulation of replacement entries or a claim about future profitability. The latest sample and older files have already been inspected, so none is described as a blind holdout. A clean out-of-sample check requires a later recording after the rule is fixed.

Check CALL/PUT symmetry, 30s/1m scope, no additional 5m restriction, reversal eligibility, unknown/missing data, stale/future/unordered inputs, already-cleared barriers and deterministic repeated evaluation. Keep the rest of the source pinned to the published baseline. Run the established prebuild regression groups and production/type build. Expiry and interface repairs must remain byte-identical.

Do not claim the candidate resolves all losses or produces profitable trading. Any statistical or retention cost must be reported even if the total snapshot score improves. Publication is a separate step after the user is shown the concrete results.

## Results

803 regression tests passed, including mirrored CALL/PUT cases for 30s/1m, 5m scope, reversal preservation, actual shared-runtime integration, no mutation/rearm and causal input handling. The production/type build passed. All other decision modules remain pinned to the published 168/179 source; worker execution, expiry keepers and UI are untouched apart from adding the test to prebuild.

Paired runtime replay covers 247 original decision instants. It adds no entries and inverts no sides. It withholds seven original LOSS and three WIN in total: the latest 137-decision upload contributes six LOSS/two WIN, and the older 160 recording contributes one LOSS/one WIN. The 164/167/168/170 recordings have no differences. Within the latest upload, 177 loses one LOSS, 178 loses one WIN, and 179 loses five LOSS/one WIN. The two 179 sessions contribute one LOSS/zero WIN and four LOSS/one WIN respectively. The record labeled 178 therefore becomes worse under this rule, a cost included in the aggregate result.

For the 179 record, simply omitting those six trades leaves 42 WIN/42 LOSS (50% excluding one tie and pending outcomes). This remains insufficient to establish profitable behavior; no replacement trades are simulated. A subsequent recording is needed for out-of-sample evaluation. Full per-case results: reports/sentinel-180-candidate-paired-replay.json.
