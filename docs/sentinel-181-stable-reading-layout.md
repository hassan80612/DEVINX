# Sentinel 13.9.181 — stable secondary reading

The supplied mobile recording shows the technical quote warning appearing beside a changing market reading. Wrapping from one line to two changes the secondary row height and pushes the countdown, receipt and totals. The same single-line reservation existed in the Windows broker overlay.

Both surfaces now use overlapping CSS grid cells. Invisible, accessibility-hidden sizing text reserves the space needed by the longest normal phase/technical combinations at the current width; the real reading stays visible and updates normally. No fixed card height, clipping, ellipsis, new timer, broker request or signal wait is added. Unexpected longer text can still expand rather than disappear. The native clock updates the visible text cell without deleting the sizing cells. The new shared worker helper contains presentation strings only.

Validation: actual React markup and production CSS in Chromium at 320, 360, 393, 768 and 1280 pixels, for 30s, 1m and 5m. Empty, lateral, reversal and continuation readings are alternated with fresh/stale quote diagnostics; the row height and countdown position remain identical. Native overlay checks verify the same transitions for all three durations, readable text, unchanged height and unchanged countdown position. An extra long text remains fully visible. All 803 existing release regression checks pass; Next production build and type validation pass.

All files under agent/src, the expiry keeper, chart-period keeper and broker executor are byte-identical to production 13.9.180. The only runtime code edit is the presentation portion of local-playwright-driver.mjs, plus its new layout-only helper. Other edits are web presentation, the two browser verification scripts and 13.9.181 release metadata. This release makes no claim about trading accuracy.

Rollback: commit b27bfd582d5805b874822f5fefe604471b8658c0, branch rollback/sentinel-13.9.180-before-181-20261030, deployment dpl_E2pEg6XWbsfLzgxFeNA3ArNSstMR. The web update fixes the site on PC/mobile; the updated Windows Agent is required for the native broker overlay.
