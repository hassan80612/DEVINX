# Sentinel 13.9.30 — installation completion

The alternative ZIP launched the shared PowerShell installer without opening the site after success. The EXE attempted a separate `rundll32` navigation and ignored launch errors. Both interactive launchers now request `OpenSiteAfterInstall` from the same installer. After manager and tray health checks succeed, PowerShell opens the canonical console through the default browser. Browser launch failures produce a warning and the exact console URL; they do not misreport a completed installation as failed. Silent updates omit the switch, and CI/payload verification does not open a page.

Packaging now sorts payload entries and normalizes ZIP timestamps and permissions. The reviewed Agent lockfile and `npm ci` replace a newly generated dependency lockfile during each deployment. Two local builds, including a change to source timestamps, produced identical EXE, payload and alternative ZIP hashes.

Validation: 243 tests passed; Next.js production build passed; isolated Agent `npm ci` succeeded. The native launcher smoke check extracted the embedded payload and passed the version, build and completion flag to a mock PowerShell executable. It is not a Windows installer or Edge test. Public and embedded installer scripts match. The prediction engine, selectors and signal timing remain byte-for-byte unchanged from 13.9.29.

Expected local artifacts:

- EXE: 2,658,304 bytes; SHA-256 `1d9e7a546aba88a7e4ce4b860730bfc4f7693896e524d8596219e33c4eb7f264`.
- Payload ZIP: SHA-256 `96f965c6032229a6d555aaff4be95ed711f1b04285eb90e1fdf74bfdc2c516ae`.
- Alternative ZIP: SHA-256 `b369ba2935ac64b7447414dec37e88ded64ac4299f3178e57750ec062eb44de8`.

The screenshot's generic Edge download error does not identify its cause. Previous public 13.9.29 downloads passed complete byte/hash and HTTP range checks. This release fixes the identified completion-path discrepancy and unstable package identity; it does not establish that the user's Windows/Edge failure has been reproduced or eliminated.
