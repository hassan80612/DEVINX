# DevinX Laser Control — arquitetura inicial

## Objetivo
Produto separado do Financeiro, ainda dentro do ecossistema DevinX. O front-end pode mudar de domínio ou nome depois sem alterar o protocolo do Agent.

Fluxo alvo:
```
Celular/PWA -> Supabase Realtime privado -> Agent Windows -> LightBurn local -> laser
```

O LightBurn não deve ser publicado diretamente na internet. O adaptador local conversa somente com `127.0.0.1`.

## Regra principal do Agent
O Agent **não é** software de acesso remoto ao Windows.

Nunca implementar:
- execução arbitrária de shell/PowerShell/cmd;
- controle genérico de mouse ou teclado;
- acesso irrestrito ao sistema de arquivos;
- download e execução de binários recebidos pelo servidor;
- portas inbound abertas no roteador.

O Agent aceita somente ações declaradas no protocolo. Uma ação desconhecida é rejeitada por padrão.

## Fases de capacidade
### V0 — leitura local
- detectar LightBurn;
- `PING`;
- `STATUS`;
- exibir saúde do Agent;
- nenhuma ação remota sobre o laser.

### V1 — pareamento e telemetria
- código de pareamento curto, único e expirável;
- token próprio por instalação;
- presença online;
- versão do Agent;
- capacidades disponíveis por versão do LightBurn.

### V2 — comandos seguros
- Frame somente quando houver endpoint oficial/capacidade confirmada;
- Pause/Resume/Stop somente quando suportados pela API ativa;
- START exige `local_arm_until` válido criado fisicamente no PC;
- idempotency key em todo comando;
- comando expira rapidamente;
- apenas um operador de comando por máquina, conforme o plano.

## Transporte
Preferência: Supabase Realtime Broadcast em canal privado por dispositivo, com autorização RLS. Isso evita polling agressivo e chamadas constantes à Vercel.

Tópicos usam IDs opacos, nunca e-mail:
- `laser:device:<uuid>`
- `laser:session:<uuid>`

O site nunca recebe segredo permanente do Agent.

## Dados
Entidades previstas:
- `laser_accounts`
- `laser_devices`
- `laser_mobile_devices`
- `laser_entitlements`
- `laser_sessions`
- `laser_commands`
- `laser_command_events`
- `laser_pairing_codes`

Todas as tabelas públicas devem usar RLS e ownership por `auth.uid()`. Ações Master não dependem de metadata editável pelo usuário.

## Licença
Planos e preços ficam em uma configuração central. Checkout, limites e entitlement são conceitos separados. Alterar preço não altera o protocolo do Agent.

## Compatibilidade LightBurn
O adaptador é versionado:
- `lightburn-rest` para versões com REST API compatível;
- `lightburn-udp-legacy` para recursos oficiais disponíveis via UDP;
- futuros adaptadores ficam atrás da mesma interface.

Nunca fingir que uma capacidade existe. A UI recebe a lista real de capacidades do Agent e desabilita o que não é suportado.
