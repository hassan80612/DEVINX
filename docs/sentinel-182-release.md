# Sentinel 13.9.182

Base: 13.9.181, commit c6619c4d9de9a0a025bfe84a53bd93a88e63f3f6. Rollback: `rollback/sentinel-13.9.181-before-182-20261030`, deployment `dpl_AYNdPeLZfWnU4MPz5hsdthMYKGyR`.

## Entry analysis

Adds a persisted, expandable entry-family preference independent of technical strategies: Automatic, Continuation, or Reversal. The preference filters qualified proposals without hiding the manual market reading or rewriting an operation already issued. Older Agents receive update guidance instead of a silently ignored control.

Automatic includes both eligible families at 30s, 1m and 5m. A 5m continuation additionally requires the existing observed long-horizon directional evidence and room before a confirmed opposing level. A brief local rebound alone cannot authorize a 5m continuation. Reversal-only retains its own stronger 5m reversal proof. The executor receives the matching immutable qualification.

Extends the existing opposing-level review to failed breakouts, fast reversals and historical rejections at short horizons. Adds causal memory of a qualified reaction missed while the previous operation was held: a later worse price on the same reaction is refused, while a new touch, new level or improved price can qualify immediately. This introduces no timed queue, candle-second cutoff or generic oscillation filter. Existing ordinary impulse and range logic, quote-freshness policy and 181 card sizing remain unchanged.

## Broker expiry

Native expiry keeper revision 16 recognizes additional labelled duration fields and generic option portals. It records the latest explicit preference, reconciles preferences across broker frames and restores the actual selected duration after reload or field recreation while idle. A deliberate manual selection of 30s remains valid. Read-only frame receipts expose the observed field value; conflicting values remain unknown rather than being guessed from the saved preference.

An optional explicit field mapping supports skins without usable labels. It is provider-scoped, persisted and revalidated against the visible field. Mapping requires a paused bot and consumes pointer clicks, including accidental CALL/PUT clicks. Starting the bot cancels mapping. The normal entry-time expiry observer remains cached, read-only and non-blocking: unknown expiry does not gate CALL/PUT execution.

## Validation and limits

- 835 automated regression tests passed; Next.js production build and type checking passed.
- Isolated Chromium fixtures exercise both supported brokers at 30s, 1m and 5m: automatic recognition/restoration, optional mapping, reload, recreated fields, explicit manual 30s, embedded-frame receipts and prevention of trades during mapping.
- Entry-family controls and native card geometry were checked in isolated browser fixtures, including mobile widths and wrapped secondary messages. No authenticated broker session or real order was used.
- The exact candidate source was compared at 397 recorded decision instants. The combined reviews withheld 21 historical losses, 6 wins, 1 tie and 1 unclosed record; restricting to executions whose actual duration matched the requested 1m gives 11 losses, 4 wins and 1 tie. In the first 63 correctly timed executions of the expanded 180 archive, the difference was 3 losses and no wins. Details are in `reports/sentinel-182-recorded-comparison.json`.
- These are same-data recorded-instant comparisons plus bounded causal reconstruction during preceding operations. They are not a complete session backtest, blind validation or a forecast of live win rate. All supplied decision records requested 1m; 30s and 5m have functional validation only. Broker expiry behavior has not been verified on the user's current Windows DOM.

Update the Windows Agent to 13.9.182 to load these changes. Select the desired broker expiry once after updating; mapping is a fallback only if automatic field recognition fails.
