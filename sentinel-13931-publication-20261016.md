# Sentinel 13.9.31 — publication evidence

Initial production deployment `dpl_6HozSWofTSQh3GxnCFaRbz4P5pHC`, pinned to `23b92495a0606fad6f395ea94aea821e957e4645`, reached READY with canonical alias `https://trading.devinx.com.br`.

Downloaded the manifest, exact EXE, both stable EXE aliases, alternative ZIP and home from production: all six returned HTTP 200. Exact EXE and both aliases match byte-for-byte. Published EXE, embedded payload and alternative ZIP match the hashes recorded in the release report. Embedded reviewed source bytes, version/build, ZIP CRC, package lockfile, shared installer and CMD line endings were verified. The five retired clock modules, selector and zero expiry-price placeholder are absent. Exact EXE, stable alias and alternative ZIP also passed HTTP 206/attachment/range-byte verification. Initial deployment-scoped error/fatal scan returned no logs; this is not a long-term uptime assessment.

Timing diagnostic using 1,065 replay evaluations with 100 already-received closed candles: mean 3.17 ms, p95 6.73 ms, maximum 9.97 ms on this environment. This measures calculation cost, not the user's PC or Windows browser rendering.

A site-only follow-up preserves v1 signature byte order for installed Agent 29/30 frames during rollout. It retains all fields in authenticated material but does not interpret, display or use their retired clock settings. New Agent 31 frames use the current serializer unchanged. Eleven targeted wire/live-frame tests passed, including two additional old-to-new rollout cases, unchanged 31 signatures, signed field tampering, relay key reordering and real socket-consumer checks. The Agent source and EXE are unchanged by this compatibility follow-up.
