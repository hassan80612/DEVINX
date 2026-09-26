# DevinX Laser Control — device pairing lifecycle

Status: **contract ready / network pairing disabled**

## Goal

Pair one Windows Agent to one DevinX account without a reusable shared code.

## Intended flow

1. Agent creates or loads its permanent ECDSA P-256 device identity.
2. Agent generates an 8-character pairing code and signed proof valid for 5 minutes.
3. Agent sends the signed pairing offer outbound to DevinX over HTTPS.
4. DevinX verifies:
   - payload shape;
   - signature;
   - public-key fingerprint;
   - 5-minute expiry;
   - nonce not previously consumed;
   - rate limits.
5. Agent receives only an opaque pending-offer ID. It still has no account access.
6. Logged-in user types the short code on the DevinX Laser Control page.
7. Server checks the user's Laser entitlement and device quota.
8. If quota allows, the pending offer is atomically claimed by that user.
9. The short code and nonce become permanently unusable.
10. Server issues a revocable Agent credential tied to:
    - user ID;
    - device ID;
    - public-key fingerprint;
    - protocol version.
11. Future Agent requests prove possession of the private device key.

## Anti-sharing rules

- short code is not a password;
- code expires after 5 minutes;
- code can be consumed once;
- pairing proof has a unique nonce;
- each plan has server-enforced PC/device limits;
- active command session count is server-enforced;
- removing a PC revokes its Agent credential;
- changing plan changes quotas without changing the Agent identity;
- IP address is telemetry only, never the license key.

## Current routes

- `POST /api/laser-control/agent/pairing-offer`
  - currently returns 503 by design.
- `POST /api/laser-control/master/claim-pairing`
  - master-gated and currently returns 503 by design.
- `POST /api/laser-control/master/verify-pairing`
  - validates a signed proof but does not persist or activate anything.

The 503 stubs are deliberate fail-closed behavior. They reserve the API shape without pretending storage is ready.
