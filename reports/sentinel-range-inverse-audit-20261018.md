# Conditional inverse audit: existing mixed-range context

Research only. Production 13.9.36 remains unchanged at a6e810400ecf1d909293d80818aa6282f5e81569. No orders, deployment, admission changes, added timers or runtime history were introduced.

The rule was fixed before evaluating these outcomes: reverse CALL/PUT only when the released pre-override automaticChartContext returns mixed-range. This category indicates low directional efficiency away from historical extremes; it is not proof of periodic oscillation or a known next reversal. It must not be conflated with the classifier's separate level-turn category or the final historical-level display label.

The audit reuses the exact released entries, entry prices and 30-second deadlines from the inverse audit. At each entry it reconstructs the same five-minute causal quote window, released adaptive-market-v1 base and automaticChartContext used inside v17. Source quotes independently score the conditional direction. Assertions verify original entry quotes, exact expiry duration, outcome identities and invariance to future/not-yet-received poison quotes. No outcome is supplied to the classifier, and no threshold was fitted. All windows were already known, so this is exploratory rather than independent validation.

| Sample | Original | Conditional inverse |
|---|---:|---:|
| Selected external mixed-range entries only | 148 wins / 167 losses (46.98%) | 167 / 148 (53.02%) |
| All external entries, other contexts unchanged | 278 / 296 (48.43%) | 297 / 277 (51.74%) |
| Selected fine-video mixed-range entries only | 6 / 2 (75%) | 2 / 6 (25%) |
| All fine-video entries, other contexts unchanged | 11 / 3 (78.57%) | 7 / 7 (50%) |
| All coarse-video entries, other contexts unchanged | 10 / 3 (76.92%) | 7 / 6 (53.85%) |

External data comprises 14 windows of the same 2020-03-30 EUR/USD Forex day, not the user's broker or OTC session. Of 326 selected external entries, 11 were ties; all external entries contain 18 ties. Ties are unchanged and excluded from hit-rate denominators. Eight external windows improved, three worsened, and three tied. Each video extraction contains one missing exit excluded from percentages. The two video extractions are the same source and cannot be summed as independent evidence.

The existing mixed-range label does not establish a consistent conditional inverse advantage: it improves the external aggregate modestly but damages working video entries. These results do not validate real-money inverse following or an accuracy gain in the user's current session. No inverse rule was published.

Reproduce with `node scripts/sentinel-range-inverse-audit-20261018.mjs` after regenerating the source fixtures as described in the preceding investigation. The JSON report retains per-entry causal labels, sides, deadlines and outcomes.
