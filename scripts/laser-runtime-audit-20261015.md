# Laser runtime retirement — 15 October 2026

## Verified production state

- Website: `devinx.com.br`, deployment `dpl_8qiTDAv2Zn7eBFC3xyANcQUdq2zn`, commit `d41dc35968d98297cb04249d3b7b868e242b56cf`.
- The website removal was already deployed. The current tree has no Laser app, agent, or Laser route handlers; middleware returns 410 before Auth/RPC and acknowledges retired Kiwify callbacks without database work.
- DEVINX Supabase `jubiwhtnhxluetzkzomm` still had 15 `laser-*` Edge Functions, 71 public routines and 22 tables in `devinx_laser`.
- No non-Laser public function body referenced `devinx_laser`. No Laser cron jobs existed. The only scheduled DEVINX task was monthly financial retention.

## Applied database containment

Executed `retire-laser-runtime.sql` in the DEVINX SQL editor. It revokes Laser-only function, table, sequence and schema access for PUBLIC, anon, authenticated and service_role, while preserving the finance access grant. No data or accounts were deleted.

Verification after commit:

| Check | Result |
| --- | --- |
| Finance access RPC executable by authenticated | true |
| Laser RPCs executable by any API role | 0 |
| Laser schema usable by any API role | false |
| Laser tables retained | 22 |
| Laser-specific Realtime/Storage policies | none |

This blocked API-driven Laser operations before permanent cleanup. It did not stop an already-running Windows process.

## Permanent cleanup completed after explicit confirmation

The user explicitly confirmed permanent deletion, conditional on preserving all other systems. Executed `purge-retired-laser.sql` successfully with RESTRICT and a transaction: 71 Laser SQL functions, 22 exclusive Laser tables and the `devinx_laser` schema were removed. The Laser-specific trigger was removed within that same transaction. No CASCADE was used.

All 15 `laser-*` Edge Functions were deleted through their individual Supabase confirmation dialogs. The remaining deployment list contains only `store-media-import-once`, which was preserved.

Final database verification:

| Check | Result |
| --- | --- |
| Laser functions remaining | 0 |
| Laser tables remaining | 0 |
| Laser schema remaining | false |
| Finance access permission retained | true |
| Profiles, financial transactions and work sessions present | true |
| Shared Auth users table and profile bootstrap function present | true |

Accounts, login, finance data and its access roles were not mutated by these scripts. The retired Laser UI/API continued returning 410, while the login and Store pages returned 200. Full authenticated Finance operation cannot be verified until the existing provider billing restriction is removed.

## Separate Supabase workload audit

Vetorize/Store/Sentinel use `vwczyqvptziyseagettp`, a different organization with cycle **16 September–16 October**, not the DEVINX cycle **15 October–15 November**.

At inspection: uncached egress **2.027 / 5 GB (41%)**, cached egress **0.426 / 5 GB**, Realtime **66,228 / 2,000,000 messages**, peak connections **4 / 200**, database **0.041 / 0.5 GB**. This project was not over its egress quota. Its expired grace-period banner must not be confused with an active service restriction.

One bounded log query for 22:45–23:45 UTC on 15 October showed 1,234 agent poll requests and 613 heartbeat requests. Declared response lengths for these were 114,762 and 14,396 bytes; these are incomplete HTTP header-based measurements and exclude websocket traffic, request uploads, and responses lacking Content-Length. They are not total egress estimates.

The current Sentinel worker uses 2.5-second command polling, heartbeats at 5 seconds when running / 20 seconds stopped, and compact signed Realtime frames only with a recent authenticated viewer. Ordinary frame cadence is 1.1 seconds, with immediate window/entry transitions. No global slowdown or changes to the user's mobile signal flow were introduced by this audit. Existing daily cleanup jobs and transient-state retention are active.

## Remaining limitation

DEVINX still returns billing restriction `402 exceed_egress_quota` despite a new cycle with 0/5 GB used. The support request was successfully submitted earlier. Removing the retired runtime does not erase previous usage or guarantee when Supabase lifts that restriction.
