# DevinX Laser Control — device pairing lifecycle

Status: **master-only pairing active / machine commands disabled**

## Goal

Pair one Windows Agent to one DevinX account without a reusable shared password.

## Current flow

1. Agent creates or loads its permanent ECDSA P-256 identity.
2. Agent generates an 8-character pairing code and signed proof valid for 5 minutes.
3. Agent sends the signed offer outbound over HTTPS to the Supabase Edge Function `laser-agent-pairing-offer`.
4. The function verifies payload, ECDSA signature, public-key fingerprint, expiry and rate limits.
5. Only HMAC hashes of the short code, nonce and source IP are persisted in the private `devinx_laser` schema.
6. The master types the short code in the hidden Laser Control page.
7. `laser-master-pairing-claim` requires a valid DevinX user session and confirms the user is a DevinX admin.
8. The service-role-only database RPC atomically consumes the offer and creates the device.
9. The Agent polls `laser-agent-pairing-status` with the same signed temporary proof and confirms when the PC is linked.
10. Future Agent authentication uses proof of possession of the permanent private ECDSA key. No reusable DevinX device password is issued.

## Anti-sharing rules

- short code is not a password;
- code expires after 5 minutes;
- offer is consumed once;
- pairing proof includes a unique nonce;
- the private Agent key never leaves Windows;
- server stores only the public key;
- PC/device limits are enforced server-side;
- active operator limits are server-side;
- IP address is rate-limit telemetry only, never the license key;
- removing/revoking a PC will invalidate future signed sessions;
- changing plan does not change the physical Agent identity.

## Active network surfaces

- Supabase Edge Function `laser-agent-pairing-offer`
  - public endpoint by necessity;
  - accepts only correctly signed temporary pairing offers;
  - cannot control a laser.
- Supabase Edge Function `laser-agent-pairing-status`
  - accepts the same signed, unexpired temporary proof;
  - returns only pairing state.
- Supabase Edge Function `laser-master-pairing-claim`
  - requires a valid DevinX user token;
  - additionally requires DevinX admin membership;
  - currently used only by the hidden master page.
- Next route `/api/laser-control/master/verify-pairing`
  - development-only master diagnostic;
  - verifies a proof without persisting anything.

## Machine safety boundary

Pairing is not machine authorization. `LASER_REMOTE_COMMANDS_ENABLED=false` remains the global hard-off. No Start, Stop, Pause or Frame request is dispatched by this pairing flow.
