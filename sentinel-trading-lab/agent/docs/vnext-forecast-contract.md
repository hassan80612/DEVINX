# Sentinel VNext: forecast first, countdown second

**Status:** research candidate, not approved for production. Production rollback remains 13.4.58.

## Contract agreed for any future engine

- One user-selected engine owns the main scenario; no consensus, veto, or shared vote with other engines.
- The user-selected expiry alone defines the future outcome to predict. No broker expiry scraping, no automatic broker-duration override. A user switching 5s to 15s asks the model a **different prediction**, not merely a different countdown.
- A forecast is real only when the engine returns: model/asset, quote timestamp, issue timestamp, chosen expiry, fixed outcome timestamp, direction, **expected future price or price interval**, and explanatory signals available as of issue time. A CALL/PUT label alone does not meet this contract.
- A forecast is pinned and never revised retroactively. New market data may generate a new forecast, but cannot rewrite an earlier one. No current forming candle closing direction is allowed to stand in for future prices.
- Distinguish `FORECAST`, `SCENARIO CONFIRMED`, `ENTRY NOW`, and `FORECAST OUTCOME` in all UIs.
- Historical predictive performance remains **unknown** until walk-forward testing with withheld future data. “Model confidence” must not be displayed as empirically measured win rate.
- Measure quote-to-analysis-to-desktop/mobile arrival separately: otherwise late signals may be wrongly blamed on prediction.
- No arbitrary decision vetoes or cross-engine permissions. Feed identity, time integrity and user selection are data integrity properties, not new market signal blockers.

## Data limitation

The current Sentinel feed provides price quotes and candles. It does not necessarily expose a verified limit-order book or directional order-flow imbalance. Do **not** invent bid/ask depth or use research results that require LOB data as if they were available here. OTC broker prices may behave differently from exchange-traded prices.

## Research foundations to evaluate, not promises

- Lucchese, Pakkanen & Veraart, *International Journal of Forecasting*, 2024, “The short-term predictability of returns in order book markets: A deep learning perspective”: https://doi.org/10.1016/j.ijforecast.2024.02.001 — horizon-specific modeling and data representation matter. Their results require order-book data; no direct performance transfer to Sentinel OTC quotes.
- Bayesian financial trend prediction and purged cross-validation: https://pmc.ncbi.nlm.nih.gov/articles/PMC9521884/ — test time-series forecasts without overlapping-label leakage.

## What is implemented in the experimental branch

1. `scenario-engine-catalog.mjs`: independent engine identity and exactly one selected motor.
2. `expiry-driven-forecast.mjs`: user-selected horizon only; broker expiry observations do not override it.
3. `forward-forecast-receipt.mjs`: immutable forward-price expectation and objective result comparison, with no fabricated win rate.
4. `automatic-forward-model.mjs`: **uncalibrated** price-history research prototype with horizon-adaptive slope, realized volatility, persistence/reversion and historical support/resistance. No current forming candle signal and no strategy voting.
5. Tests for 5s/10s/15s Blitz, all longer selected horizons, no future input leakage, honest unresolved outcomes and no silent broker override.

## Not yet implemented / not allowed to advertise as complete

- Specialized, empirically validated forecasting logic for every selectable strategy.
- 5s/10s/15s live forward hit-rate, latency measurements and broker-vs-quote settlement validation.
- Desktop/mobile integration and Windows installer for VNext.
- Operational trade signal permission for any experimental model.

**Go/no-go:** replay real timestamped quote history chronologically for each expiry and provider/asset, compare prediction correctness and projected-price error to simple continuation/reversion baselines, verify signal age and user-selected duration, then DEMO forward test before any production release.
