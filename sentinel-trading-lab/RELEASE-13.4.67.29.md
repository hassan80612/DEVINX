# Sentinel 13.4.67.29 — deployment candidate

## Release checks
- Website, Agent and update manifest are version 13.4.67.29.
- Windows smoke and build pipeline passed: https://github.com/hassan80612/DEVINX/actions/runs/38469595912
- Continuous forecast selection, original window and confirmation restored byte-for-byte to 13.4.67.26; no new two-second expiry veto or Continuous-only counterpressure veto.
- Selective mode hidden from product cards; preserved in code but existing saved Selective preference migrates to Continuous.
- Public Home, Portuguese/English locale, sign-out to Home, market selector and 30-day plan page.
- Brazil checkout: R$ 280, https://pay.kiwify.com.br/SQku9Rd
- International checkout: US$ 50, https://pay.kiwify.com/VNHYsjX?intl=1
- Billing: signed webhook must explicitly whitelist a separate Brazilian Kiwify product id via SENTINEL_KIWIFY_BR_PRODUCT_ID if its ID differs from the original Sentinel product; pending validation.
- Trade execution is manual. No claim of accuracy or profitability.

Previous production 13.4.67.28 remains available for rollback.
