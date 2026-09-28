# Laser Control — inventário do backend de produção

Snapshot gerado em 2026-09-28 para reduzir drift de documentação sem alterar o backend crítico.

> Este arquivo é inventário operacional. O código das Edge Functions em produção não é alterado por esta limpeza.

| Função | Versão | Status | verify_jwt |
| --- | ---: | --- | --- |
| `laser-agent-command` | 3 | ACTIVE | false |
| `laser-agent-heartbeat` | 3 | ACTIVE | false |
| `laser-agent-mentor-offer` | 2 | ACTIVE | false |
| `laser-agent-mentor-status` | 2 | ACTIVE | false |
| `laser-agent-pairing-offer` | 2 | ACTIVE | false |
| `laser-agent-pairing-status` | 1 | ACTIVE | false |
| `laser-agent-preview-control` | 2 | ACTIVE | false |
| `laser-agent-preview-upload` | 1 | ACTIVE | false |
| `laser-master-command` | 4 | ACTIVE | false |
| `laser-master-device-access` | 2 | ACTIVE | false |
| `laser-master-devices` | 3 | ACTIVE | false |
| `laser-master-pairing-claim` | 5 | ACTIVE | false |
| `laser-master-preview` | 3 | ACTIVE | false |
| `laser-master-remote-session` | 2 | ACTIVE | false |
| `laser-mentor-session` | 2 | ACTIVE | false |

## Regras de manutenção
- Não remover Edge Functions, RPCs, migrations aplicadas ou rotas de compatibilidade apenas por parecerem antigas.
- Antes de aposentar um caminho legado, confirmar ausência de consumidores no site, Agent e logs de produção.
- A autorização efetiva do Laser continua no backend (JWT/assinatura do dispositivo + RPCs de autorização).
