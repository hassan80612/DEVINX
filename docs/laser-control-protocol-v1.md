# Laser Control protocol v1

Status: **foundation / remote dispatch disabled**

## Non-negotiable safety boundary

The Agent is not a remote desktop product. No message may request arbitrary execution, mouse/keyboard control, shell access, file browsing, or generic Windows automation.

The protocol contains a fixed command enum:
- `status`
- `frame`
- `pause`
- `resume`
- `stop`
- `start`

Unknown commands are rejected.

## Current build

`LASER_REMOTE_COMMANDS_ENABLED=false`.

The Windows Agent V0 supports only local LightBurn diagnostics:
- PING
- STATUS

No website request can reach the Agent yet.

## Future command validation order

Before a command reaches a LightBurn adapter, the receiver must validate:

1. protocol version;
2. authenticated device identity;
3. active entitlement;
4. device not revoked;
5. active control session belongs to the same owner/device;
6. command exists in the fixed allowlist;
7. Agent-reported capability supports the command;
8. command has not expired;
9. idempotency key was not already consumed;
10. for `start`: `remote_control_enabled=true` and `local_arm_until > now()`.

Failure at any step means reject + audit event.

## Transport

Transport is intentionally not implemented until the correct DevinX Supabase project is identified and the private schema/RPC layer is reviewed.

Do not use frequent Vercel polling as the default transport. Prefer a private realtime channel or another authenticated outbound connection that does not expose the PC to inbound internet traffic.
