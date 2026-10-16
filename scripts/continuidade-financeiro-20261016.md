# Continuidade DEVINX — Financeiro e consumo Supabase

Estado verificado em 16/10/2026 UTC (noite de 15/10 no Brasil).

## Resultado e pendência real

O runtime do Laser Control foi removido do projeto DEVINX. O Financeiro mantém banco, tabelas, usuários, login compartilhado e permissões. Porém, o Financeiro **ainda não está operacional**: o Supabase mantém a organização DEVINX restrita e responde HTTP 402 `exceed_egress_quota`, mesmo mostrando 0/5 GB no ciclo atual. Não confundir páginas públicas HTTP 200 com funcionamento autenticado.

Um chamado Billing/Urgent foi enviado pelo painel para o projeto DEVINX. O painel confirmou envio para o e-mail da conta Hassan. Não apresentou número do chamado. Não foi autorizado acesso adicional do suporte ao projeto nem contratado upgrade.

O pedido atual é restaurar o Financeiro sem prejudicar os outros sistemas. O usuário NÃO pediu para colocar o Financeiro dentro do Sentinel. Outro chat está desativando Vetorize e preservando a Loja; evitar alterações concorrentes nesse projeto. Nenhum downgrade de plano ou versão foi iniciado.

## Identificação para evitar alterações no projeto errado

| Sistema | Identificador / localização |
| --- | --- |
| Financeiro DEVINX | `https://devinx.com.br` |
| Supabase DEVINX | projeto `jubiwhtnhxluetzkzomm`, organização `oqotydahfsmuakepkqne`, us-west-2 |
| Ciclo DEVINX | 15/10/2026 a 15/11/2026; egress atual 0/5 GB; Free; serviços restritos |
| Supabase Loja / Sentinel / Vetorize | projeto `vwczyqvptziyseagettp`, organização `olwkkexyudxzxincabnh`, us-east-2 |
| Ciclo Loja / Sentinel na inspeção | 16/09/2026 a 16/10/2026; egress 2,027/5 GB, cerca de 41%; sem bloqueio ativo por egress observado |
| Vercel DEVINX | projeto `prj_oTSN215IZtUv0oHhznjxaH8qA86F`, equipe `team_WiM8Ald19qQOwgsZq03owq8g` |
| Produção DEVINX observada | deployment `dpl_8qiTDAv2Zn7eBFC3xyANcQUdq2zn`, commit `d41dc35968d98297cb04249d3b7b868e242b56cf`, branch `fix/finance-auth-isolate-20261015` |
| Repositório | `hassan80612/DEVINX` |
| Branch deste registro | `fix/retire-laser-runtime-audit-20261015` |

A integração Supabase do chat só enxerga o projeto Vetorize. O mesmo usuário consegue abrir as duas organizações no painel. Não pedir outra conta como suposta correção. O acesso ao DEVINX foi realizado pelo navegador autenticado, após autorização do usuário para essa alternativa.

## O que foi efetivamente removido

1. A produção já tinha retirado app, agente e rotas do Laser. Middleware responde 410 às rotas retiradas antes de consultar Auth/RPC. Webhook antigo recebe confirmação sem executar processamento Laser, evitando repetição do provedor.
2. Foi aplicado `scripts/retire-laser-runtime.sql` para bloquear primeiro o acesso às estruturas exclusivas do Laser.
3. Após confirmação explícita do usuário, `scripts/purge-retired-laser.sql` removeu 71 funções SQL públicas `laser_*`, 22 tabelas exclusivas e o schema `devinx_laser`, dentro de transação, usando RESTRICT, sem CASCADE. Dependências não Laser foram verificadas antes.
4. Foram excluídas as 15 Edge Functions `laser-*`: agent-heartbeat, agent-command, agent-mentor-offer, agent-mentor-status, agent-pairing-offer, agent-pairing-status, agent-preview-control, agent-preview-upload, master-command, master-device-access, master-devices, master-pairing-claim, master-preview, master-remote-session, mentor-session (todas com prefixo `laser-`).
5. A Edge Function `store-media-import-once` foi preservada.

Verificação final no DEVINX: zero funções Laser, zero tabelas Laser, schema Laser ausente; `get_devinx_access_status()` continuava executável por authenticated; `profiles`, `transactions`, `work_sessions`, `auth.users` e `handle_new_user()` presentes. As rotas Laser retornavam 410; entrada, Loja e Sentinel retornavam 200 nas verificações públicas.

Resto inerte identificado: bucket privado `devinx-laser-preview`, com um objeto de 109.137 bytes. Não foi excluído. O objeto ocupa espaço; armazenamento parado não implica tráfego contínuo. Variáveis antigas `KIWIFY_LASER_*` ainda existem na Vercel, sem rotas consumidoras no código atual; uma variável armazenada sozinha não executa tarefas. Não confundir `laser-art-desk-orders`, do outro projeto, com Laser Control.

## Auditoria geral de consumo

Janela de logs: 15/10/2026 00:05 UTC a 16/10/2026 00:05 UTC, no projeto Loja/Sentinel/Vetorize.

| Operação | Requisições | Resposta declarada nos headers |
| --- | ---: | ---: |
| sentinel_agent_poll | 16.455 | 1.530.036 bytes |
| sentinel_agent_heartbeat | 8.111 | 196.298 bytes |
| sentinel_web_presence | 1.029 | 12.348 bytes |
| sentinel_auth_me | 274 | 11.542 bytes |
| sentinel_remote_status | 106 | 42.534 bytes |

Os aproximadamente 83 MB de heartbeat enviados ao servidor são ENTRADA, não saída. Os valores acima são comprimentos declarados em HTTP: não medem egress total, respostas sem Content-Length, nem mensagens websocket. Houve 44 conexões websocket no período; isso não significa tráfego zero. Não extrapolar esses dados para prometer consumo mensal.

Não foi encontrada outra avalanche de erros nessa janela. Poll e heartbeat não registraram erros. Havia dois dispositivos cadastrados e apenas um recentemente ativo. As 28 execuções cron observadas não tinham falhas. Só partner-store-retention teve execução registrada entre as Edge Functions inspecionadas (22 chamadas); funções antigas de backup/export sem invocação observada não consomem continuamente apenas por estarem implantadas.

O Sentinel já tem proteções: comandos a cada 2,5 s; heartbeat 5 s rodando / 20 s parado; guardas contra chamadas sobrepostas; atualizações de presença reduzidas no SQL; frames compactos apenas com espectador recente autenticado, cadência normal de 1,1 s. Não foi aplicada redução global que prejudique os sinais no celular. Nenhuma alteração no Sentinel foi publicada por esta auditoria.

As tarefas de retenção financeira, da Loja e do Sentinel foram preservadas. Os buckets de arte/histórico e mídias da Loja foram preservados. Não apagar arquivos de usuários para tentar resolver egress já consumido. O alerta de logs acima da franquia no outro projeto se referia a cobrança futura em 2027, não ao bloqueio atual do DEVINX.

## Recuperação segura do Financeiro

O bloqueio é aplicado à organização/projeto Supabase, não apenas a uma rota Laser. Trocar o caminho do site, hospedar a tela no Sentinel ou usar a mesma API por proxy não remove o bloqueio do backend. O banco continua acessível no SQL Editor administrativo; isso não substitui Auth nem cria uma conexão segura para o aplicativo.

Foram conferidos os nomes das variáveis Vercel do DEVINX, sem revelar valores. Não há DATABASE_URL/POSTGRES_URL nem conexão direta alternativa já configurada. O site usa URL e chave publicável Supabase. Uma contingência por Postgres direto exigiria credenciais e implementação de autorização/sessão; não foi criada. Não reutilizar o SQL Editor ou credencial administrativa como backend do Financeiro. Não desativar RLS, validar usuário só por e-mail ou criar bypass Master.

A documentação oficial informa que restrições por consumo são liberadas quando a franquia renova, podendo haver pequeno atraso. A liberação imediata indicada é upgrade de Free para Pro, ou desligar Spend Cap quando já em Pro. DEVINX está em Free. Não contratar plano, remover limites, recriar banco ou migrar autenticação sem decisão específica do usuário.

Próximos passos operacionais:

1. Consultar o estado atual do DEVINX e a resposta do chamado. Reconfirmar ciclo e 402 com uma única consulta curta; evitar loops de teste.
2. Se continuar bloqueado com 0/5 GB, usar o chamado já aberto para revisão da restrição residual. A caixa hassan80612@gmail.com não está entre as contas Gmail expostas à integração nesta sessão; não afirmar que sua resposta foi verificada.
3. Assim que a API for liberada, validar no Financeiro: login normal, acesso Master existente, leitura de saldo/transações, gravação de uma operação autorizada e exclusão reversível dessa operação de teste. Não criar movimentação financeira de teste sem autorização específica.
4. Confirmar que Loja e Sentinel permanecem funcionais. Conferir o resultado do outro chat sobre Vetorize antes de novas mudanças nesse projeto.
5. Revisar consumo por serviço após atividade real. Distinguir organização DEVINX da organização Loja/Sentinel; distinguir egress de upload, tamanho de arquivo e mensagens Realtime. A auditoria pontual não é monitoramento contínuo.

## Continuidade após eventual mudança de versão do chat

Os efeitos aplicados no Supabase e a produção Vercel não dependem deste contexto de conversa. Este arquivo e os scripts ficam versionados na branch de auditoria. Não reaplicar scripts de purge: a exclusão já foi executada. Não usar `main` como suposição da produção; a produção observada veio de outra branch e pode mudar por trabalho concorrente. Consultar deployment e commit atuais antes de qualquer publicação.

Testes existentes executados no código de produção observado: 24 passaram em `tests/financeiro-20261015-access-error.test.mjs` e `tests/critical-rules.test.mjs`. Isso verifica salvaguardas de código; não comprova login real enquanto existir 402. O código já distingue indisponibilidade de quota de senha errada ou assinatura cancelada.

## Referências oficiais consultadas

- https://supabase.com/docs/guides/platform/billing-faq
- https://supabase.com/docs/guides/platform/manage-your-usage/egress
- https://supabase.com/docs/guides/platform/billing-on-supabase

Este registro não contém senhas, tokens, chaves privadas ou dados financeiros de usuários.
