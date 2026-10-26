# Sentinel 13.9.121

Base: published 13.9.120, commit 518bf8c48514e9bf1a93e663920dea3bb3218fcd.

- Refresh native expiration keeper permission from current executor receipts, at least once per second, independently of the full overlay. Migration preserves v2 preferences and revokes older keeper permission. Before direction dispatch, inspect a known native duration mismatch and skip that signal without repeating a click or disabling the bot. Never infer an unknown native duration. Repair occurs only between settled operations; the original trigger for the broker's reset remains unconfirmed.
- Recognize a fast rejection of a previously established directional level using only received quotes: two meaningful consecutive movements away from the extreme, historical pivot and independent rejection evidence, a fresh confirmation, and room to the next opposing level. Reverify this evidence in the existing shared pivot guard. Existing lifecycle still owns issued windows; no extra timer or candle is introduced.
- Skip periodic full-page discovery while passive prices, account and candle history are healthy; retain discovery when recovery is needed.
- Keep text-only market totals, current quote and executor receipts independent of the heavy overlay's execution deferral. Preserve latest-frame coalescing, context checks and stale-quote clearing.

Validation: 648 required prebuild tests passed, plus six additional fast-level/maintenance tests. Full-runtime controlled fast reversals exercised both directions, all five strategies and all seven supported durations. A native expiry simulation restored 1 minute after a 30-second reset following 13 operations. Chromium rendered 27 accelerated synthetic operation cycles with live totals, including executing states, without page errors or growth in DOM/listener/timer counts. Totals patch median was 0.1ms on this synthetic page; this does not measure a live broker session.

A paired replay over one 179-second recorded price trace yielded identical entries and outcomes across 70 strategy/duration/delay combinations. These are overlapping scenarios on a single trace, not 70 independent datasets. Technical tests and controlled reversals do not establish improved live accuracy or guarantee profitable results.
