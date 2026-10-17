# Sentinel 13.9.31 — historical price structure and local signal deadlines

User story: received candles and quotes for the selected asset → historical price structure and expiry direction → one immutable issued signal → the same deadline on the PC overlay and signed mobile card.

## Changes

Removed the broker-clock selector, browser preference synchronization, broker-boundary admission/expiration, visible clock parser, rendering helper and fixed-expiry/buy-cutoff helpers. Removed the corresponding wire fields and persisted setting during migration. The five obsolete source modules are deleted. Remaining protocol server timestamps are transport metadata for existing historical-data requests and heartbeat messages; no broker wall clock participates in analysis, admission or display. PC-to-mobile clock offset remains necessary to display the PC's original signal deadline on another device.

The shared base now receives the correct asset's verified candle history. It maps highs/lows across the latest 100 closed candles, groups nearby levels using observed true range and calculates EMA 20/50/100 when enough received candles exist. Forming candles and future arrivals are excluded. Candle-derived structure is cached by asset/provider and candle contents; reactions are evaluated on fresh quotes. No additional network request, DOM scan, database write or new collection timer was added.

Historical rejection, sustained breakout and a decelerating approach are distinct cases. A touch alone does not reverse direction. A contradictory ready expiry forecast causes an unresolved decision rather than automatic inversion. Sparse history continues through the existing analyst without treating a handful of candles as the requested wider structure. Confirmed historical reactions and aligned historical trend evidence can admit an entry without waiting for four new 10-second blocks. An issued side remains immutable until its local deadline. Removed the PC's obsolete zero-valued expiry-price field, preserving entry price.

## Evidence and limits

- 221 required tests passed, including historical levels 10/50/99 candles back, mirrored rejection/breakout cases, candle corrections, future/stale data, retired-setting migration, runtime admission, compact mobile deadlines and actual PC timer execution. Obsolete tests that required the removed broker-clock feature were retired; unrelated startup, installer, feed, locale and deadline checks were preserved.
- Next.js production build and Windows EXE cross-build passed. The 13.9.30 shared installer completion path is preserved.
- A controlled full-runtime case with 100 already-received closed candles and 14 seconds of fresh quotes issued its observed historical reaction immediately. This is a specific engineering case, not a universal startup-time guarantee.
- The earlier video replay without the unavailable 100-candle context preserves the exact 13.9.30 entries: higher precision fixture 10 wins/4 losses/1 unresolved; lower precision extraction 10/3/1. They are two extractions of the same video, not independent samples. They do not establish improved live accuracy from the new historical-context feature.
- Releasing every fitted forecast unconditionally reduced waiting but worsened the replay; that experiment was rejected. A first attempt to force every nearby reaction also worsened a short candle reconstruction; it was rejected in favor of explicit context and forecast-conflict handling.
- The screenshots do not contain the full chronological quotes or 100-candle feed at the photographed entries. Their precise decisions and outcomes cannot be reconstructed from those stills. Synthetic historical-structure tests establish specified behavior, not an 80–90% live win rate. Windows browser opening is not tested in this Linux environment.

## Local artifact identity

- EXE: 2,651,136 bytes; SHA-256 `619886587a7765a63c3a86d398b612c22abee58196788bd76ab615cc70ccf83a`.
- Embedded payload ZIP: SHA-256 `16e7bbea714033a735add423895e0c3d3fafdb7b52fe2c7f615375fec7da4c56`.
- Alternative ZIP: SHA-256 `f18ebf58a2aec246ac6aced307916f44873f849b814b37d4a6a91df9a695f4ba`.
