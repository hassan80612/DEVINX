# Sentinel 13.9.183

Base: 13.9.182, commit `2d0458b596c6191d2a11963c951201f4d1c9166f`. Rollback branch: `rollback/sentinel-13.9.182-before-183-20261030`; deployment `dpl_Cw6J331HDq1bCkNY2yK73ZqSMdQ1`.

Removes the expandable broker-expiry mapping panel from the website/mobile card and native PC overlay. The expiry keeper and automatic restoration behavior remain byte-identical to 182. Internal legacy mapping APIs remain compatible; this release does not claim to repair automatic expiry on the user's broker DOM.

Moves entry type beside Strategy and before Duration in the existing selector row. Uses the same native-select appearance, existing settings handler, pending-edit protection and persisted `entryFamily` preference. Three choices remain Automatic, Continuation and Reversal. Compact desktop and mobile cards use zero-minimum columns so a narrow floating card cannot give the strategy control effectively zero width. Selectors share a label baseline and equal heights.

The secondary reading now has separate intrinsic grid slots for market interpretation and feed diagnostics. Each slot reserves its normal wrapped-text space, including when empty. This prevents appending a stale-quote warning from rewrapping the market reading and moving the countdown. Text remains fully visible, with the existing font and color; no clipping, new timer, network request or analysis wait is introduced.

Validation: all 835 required regression checks passed; Next production build/type checking passed. Isolated Chromium checks verify real native select commands, selection retention across full overlay updates, removal of expiry mapping controls, alignment and matching control heights at all three durations. Actual React markup plus production CSS was checked at 320, 360, 393, 768 and 1280 pixels, across 30s, 1m and 5m, with empty, short, reversal, continuation and wrapped/stale readings. Countdown position and secondary-row height stayed stable. Native checks exercise both full overlay reconciliation and clock-driven updates, without an authenticated broker session or trades.

All files under `agent/src`, `broker-native-expiry-keeper.mjs` and `signal-executor.mjs` are unchanged. The updated Windows Agent is required for native-overlay presentation changes.
