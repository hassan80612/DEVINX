# Sentinel 13.9.36 — observed timestamp sampling

User-authorized production release based strictly on published 13.9.35 commit `406c8f6b7ffa6fa90cad6575c0903ba78205b697`. Build identity: `13.9.36-observed-timestamp-sampling`.

The 30-second forecast previously built a 1-second grid anchored to the current quote and accepted historical prices within only 500ms before each grid point. A valid 1Hz price history could therefore be accepted at current quote +250ms and discarded at +750ms. The correction retains one actual last quote per absolute second with its true timestamp. It never invents observations or fills missing seconds. Existing quote verification, arrival-time, freshness, minimum-history and real-gap checks remain active.

This is a technical data-input correction. Research did not establish a consistent general increase in predictive accuracy. Both known-video extractions preserved their complete entry/outcome lists; one inspected external Forex window improved, while additional nonempty reserved windows were unchanged. This does not establish improved broker or OTC live results.

The experimental candle-entry timing filter, forecast-confidence gating, alternative forecast equations, analogue overrides and candle-pool correction are excluded. No extra admission wait, history accumulation, database operation or broker-clock reading was added. The single-decision 30-second entry lifecycle is unchanged.

The site and Agent release metadata move together to 13.9.36. The existing installer build process recompiles the Windows launcher with this exact source payload and generates matching versioned downloads, aliases and update SHA-256 manifest. No launcher or PowerShell installer behavior was changed.

Seven new regression tests cover the millisecond-phase defect, real gaps, actual timestamp invariance, future/late-arrival exclusion, last-observation selection, current quote validation and exact preservation of twelve frozen aligned 13.9.35 forecasts. The frozen reference was generated from the unchanged production commit before applying the patch.

Two existing tests depended on the deliberately replaced sampling behavior and were updated while preserving their contracts. The wide-fit comparison now uses actually recorded aligned inputs shared by both samplers and asserts the forecast is available; the historical-level integration test uses a different recorded point that still explicitly verifies narrow CALL / selected wide PUT / matching PUT rejection. These fixture changes use no future outcome or win-rate selection.

Required checks: complete existing prebuild suite plus the seven new tests; rebuild Windows installer; verify downloaded ZIP CRC, manifest SHA-256, embedded payload, exact Agent source identity, generic aliases and byte-range download responses. Native execution on the user's Windows machine is outside these server/package checks.
