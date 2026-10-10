# Sentinel 13.4.60: desktop and mobile realtime repair

Release integration contract, keeping 13.4.59 immutable as fallback.

- Signed, ephemeral mobile broadcasts carry the selected engine, selected expiry, quote and the SAME prospective future-price receipt already calculated by the Agent. No second forecasting model on mobile; no database writes.
- The PC legacy appearance returns as **MERCADO AGORA**, **ESTRUTURA ANTERIOR** and **TOTAL DOS TOTAIS**. The last is only the average of the first two market readings; it does not include the motor and does not authorize a trade.
- All selected-motor direction, forward price, call/put projection indices and target time appear only inside **PROJEÇÃO FUTURA**.
- The normalized percentages are descriptive technical pressure indices, *not* win probabilities. They do not vote, inhibit or command the selected engine.
- The full mobile and floating mobile share the same forecastReceipt component and realtime data subscription.
- A changed motor or expiry triggers an urgent signed frame even when price timestamp has not changed.
- The Agent may cache evaluation outcomes in memory for historical validation without repeatedly writing to Supabase.
- Do not claim 13.4.60 predicts with a validated win rate. Run DEMO forward tests and monitor latency before enabling any automatic trading.
