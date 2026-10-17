# 13.9.34 versus recovered full 13.9.35 — read-only audit, 2026-10-17

The user reported worse live accuracy after moving from 34 to 35. This audit did not reproduce a decision difference on the available input. It does not disprove the user's live observation.

Reference: fa0343e9df66511072d51efa7b39d5c40fca5443.
Candidate: 406c8f6b7ffa6fa90cad6575c0903ba78205b697.

## Findings

Both versions produced identical entry times, direction, entry prices and expiry times on the existing video extracts. The finer extract yielded 11 wins, 3 losses and 1 entry without a covered expiry in both versions. The coarse extract yielded 10 wins, 3 losses and 1 uncovered expiry in both versions. These are two representations of the same previously used video, not independent validation samples.

Three controlled eight-minute sessions used the released driver, market adapter and runtime at 1, 10 and 40 quotes per second, with 100 completed OHLC candles available and sufficient duration to exercise the five-minute pruning boundary. Entry outputs and per-observation ready/side/reason were identical between versions in all three sessions. Synthetic outcomes are not an estimate of real trading accuracy.

The source differences affecting runtime behavior are five-minute quote retention and indexing of observed swing sequence lookups. The direction-selection modules are unchanged. The performance changes could still change live scheduling and therefore actual entry timing. This audit supplied identical decision timestamps and did not model Windows scheduling, asynchronous worker contention, broker order receipts or manual click latency.

## What remains unresolved

A causal explanation of the reported current live regression requires the current session's incoming quotes/candles and analysis/entry timestamps, or a recording exposing those events. Existing historical replays cannot establish that no live regression occurred. No live accuracy improvement was established for version 35. No strategy change, production deployment or rollback was performed for this audit.

## Reproduce

Obtain the approved 34 source from the alternate installer payload corresponding to the reference commit and extract its agent directory. Set SENTINEL_34_SOURCE_ROOT to that directory, then run:

    node scripts/sentinel-34-35-accuracy-audit-20261017.mjs

Use the candidate source and the two recorded fixtures named in the script. The JSON companion retains every compared emitted entry. The script invokes the released validation gate and does not execute the complete browser-to-broker order flow.
