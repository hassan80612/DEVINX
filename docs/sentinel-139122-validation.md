# Sentinel 13.9.122

Includes the native expiry protection, verified fast level reversals, healthy-feed DOM scan reduction and text-only totals updates from 13.9.121.

Native expiry selection now retains the verified opener while its popup contains multiple duration labels. Trusted pointer selection is accepted only after the native control confirms that duration. A missing control clears the last observation instead of retaining a stale mismatch. Executor authorization uses the worker receipt's source timestamp, so delayed cosmetic updates cannot reauthorize a repair after physical-entry revocation. Keeper revision 4 disposes revision 3's own timer/listeners and preserves the saved native preference.

Validation: 654 full-build tests plus three added native-picker tests passed locally; those three are included in the release prebuild suite. Next build and Windows compilation passed. Actual local Chromium exercised 16 accelerated operation cycles for each of IQ Option and Exnova fixtures, restored a known 30s rollback after cycle 13 in the safe gap, respected a manual switch to 2 minutes, and updated totals during dispatch. No real broker requests or trades occurred in that fixture.

Prediction and executor rules remain those validated in 13.9.121. Its paired replay preserved all entries/outcomes across 70 overlapping strategy/duration/delay scenarios on one 179-second recorded trace, and controlled full-runtime fast reversals covered both directions, five strategies and seven durations. This is technical verification, not proof of a higher live win rate. The Windows executable was compiled but not executed on Windows; the user's live broker load was not measured.
