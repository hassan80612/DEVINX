# Sentinel 13.9.178

Base: published 177, commit 75c1d74033c87495d9db6c0752a94bc579d96635, tree 5ad45e720b24076397b6c3fbd74501cabf85d0a1. Preserve the existing rollback branches, commercial pricing, reversal detectors and execution acknowledgement checks.

## Continuation while a candle is forming

The additional 30s/1m path recognizes an observed resumption after a closed countertrend pullback in an established moving-average trend. It requires a confirmed same-side support/resistance or EMA20 touch, a continuous quote history, multiple initial directional price changes and sufficient room before the previous swing edge and opposing confirmed levels. It uses the current candle's observed quotes; neither its future close nor a break above/below the old swing is required. The allowed price displacement scales with recent observed movement. The existing shared context, price, expiry-position and runtime checks still apply. There is no new waiting queue, fixed entry second or timed rearm. The 5m policy remains reversal-only.

A separate correction removes the generic fresh-pivot-break exception from the late-price review. A small newly broken pivot no longer renews an already extended leg. Independently verified reversal proof keeps its existing handling. The presentation kind is now retained as entry-price-already-extended rather than overwritten by the underlying risk object.

## Native expiry and execution

The executor now reads cached native expiry telemetry through observeNativeExpiryForClick. Unknown values, known mismatch, restoration in progress and read errors do not veto a valid signal's direction click, for either provider and on every click. This supersedes the known-mismatch veto retained in 177. The observer revokes the idle repair lease but performs no picker discovery, poll, repair or wait. Unknown timing remains null; actual acknowledgement/reconciliation, deadlines and duplicate protection remain. The legacy inspect helper remains available for diagnostics but is no longer used by the bot's entry path.

Native keeper revision 15 distinguishes an explicit manual/analyst 30s choice from an inherited default. An implicit 30s reconnect cannot overwrite a saved non-default preference. A stable visible 1m/5m choice supersedes an inherited 30s default. A trusted explicit 30s choice remains supported. Generic discovery recognizes adjacent DOM text such as Tempo00:30 without assuming a space between label and clock. Chart period and native order expiry remain separate controls.

The shorter card and legible blue secondary line from 177 are retained. All operation fields remain visible; longer text wraps.

## Validation and limits

848 prebuild regression tests passed; Next.js production build and type checking passed. New tests cover actual executor-path simulated repeated clicks for both providers and all three durations across unknown/mismatch/repair/read-error states; inherited versus explicit 30s; mirrored CALL/PUT forming-candle cases; exclusion of future observations; and the shared runtime releasing a continuation before the forming candle closes. No real broker orders are placed by these tests.

Paired replays of 120 recorded decision instants retained all 60 recorded WIN candidates accepted by 177 and additionally declined the recorded 170 #14 extended-pivot entry. The new forming-candle path adds no admissions at those historical decision instants; it is intended to recognize opportunities between them. These are isolated causal snapshots, not a complete session simulation or evidence of improved profitability. Earlier entry can change subsequent live opportunities. No zero-loss claim is made.

Isolated browser fixtures cover adjacent Portuguese label/clock nodes, generic unlabelled portal menus, manual choices and immediate reloads across 30s/1m/5m, plus busy-executor repair permissions and child-frame reload handling. UTF-8 is explicitly declared in the localized fixture. The user's actual live broker DOM is unavailable; fixture success does not establish that every broker skin is recognized or that the reported live reset can never recur.
