# Rejection/expiry agreement: full-runtime A/B, rejected

The published 13.9.36 code at a6e810400ecf1d909293d80818aa6282f5e81569 remains unchanged. Research copies alone were modified. No deployment, installer, broker order, Supabase write, runtime history increase or fixed waiting timer was introduced.

## Hypothesis

The published historical-level and multiscale-candle routes can admit a short current price rejection even when the original wider expiry decision is unready. A few seconds of reaction do not themselves establish a direction 30 seconds ahead. Two rules were frozen before evaluating new validation-window outcomes:

1. Expiry agreement: admit a standalone historical/candle rejection only when the original v1 decision is ready and has the same side; any ready selected projection must also agree. Other routes, including explicit sequence changes, break/retests and clear-room followthrough, stay unchanged.
2. Sequence only: do not admit standalone historical/candle rejections; retain separately recognized structural sequence changes and every other existing route.

Both affect only 30-second standalone-rejection paths. They add constant-time decisions to existing calculations and no new history or collection warmup. Analysis continues at the next quote; the original immutable full-expiry signal lifecycle is unchanged. Replays compare the actual runtime entry streams, because preventing an entry changes later entry times.

## Results

| External sample | Published | Expiry agreement | Sequence only |
|---|---:|---:|---:|
| Five previously inspected windows | 115 wins / 123 losses (48.32%) | 76/67 (53.15%) | 73/65 (52.90%) |
| Four newly reserved windows | 67/66 (50.38%) | 43/44 (49.43%) | 37/46 (44.58%) |

Ties remain scored separately and are excluded from these denominators. No exit is missing. All external windows come from the same 2020-03-30 EUR/USD Forex bid dataset, not independent market days or the user's broker/OTC session. New windows were 04/06/07/22 UTC, 30 minutes each, registered before either candidate or baseline outcomes there were examined. They are now known and must not be reused as untouched validation.

Both video extractions preserve every exact entry, price, direction and deadline: fine extraction remains 11 wins/3 losses plus one missing exit; coarse remains 10/3 plus one missing exit. They describe one already-known video, not independent sessions. Quote-only video contains no verified historical candle context for the targeted rejection routes, so unchanged results do not establish safety on native broker candles.

The validation loss and entry-coverage tradeoffs rule out publication. At 06 UTC, both candidates changed 19 wins/21 losses into 11/17 and the maximum loss streak increased from 4 to 7. At 22 UTC, 12/10 became 0/5, with one tie, and the maximum inter-entry gap increased from 534 seconds to 1124 seconds. At 07 UTC agreement improved to 28/16 from 25/25, but the aggregate and other-window failures prevent calling it a consistent solution. Reducing signals is not by itself an improvement.

## Verification and disposition

Eleven meaningful unit tests pass for mirrored CALL/PUT disagreement handling, exact pass-through on supported agreement, preserved structural and non-rejection routes, other durations and immutable held expiry. The seven published baseline entry lists exactly reproduce the saved preceding replay, including both video extractions and all five development windows. Full-runtime reports retain all three entry streams and analysis timing. Offline timings do not measure Windows broker UI latency or waiting between qualifying signals.

Both rules are rejected. The initial development gain did not validate. This does not eliminate the identified narrow-reaction weakness, establish a corrected engine or prove current live accuracy. It prevents shipping another unverified change that could worsen working behavior.

Reproduce with `node scripts/sentinel-prepare-external-ticks-20261017.mjs`, `node --test tests/sentinel-rejection-expiry-agreement.test.mjs`, `node scripts/sentinel-rejection-expiry-ab-20261018.mjs`, and `SENTINEL_REJECTION_EXPIRY_SET=holdout node scripts/sentinel-rejection-expiry-ab-20261018.mjs`.
