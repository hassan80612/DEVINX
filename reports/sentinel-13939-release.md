# Sentinel 13.9.39 — execução local das decisões do analista

Base original: 13.9.38, commit 3d9317181686a5b14bdb57834560d984d9ea375c, preservado em backup/sentinel-13.9.38-original-20261018. O deployment dpl_8krxzDhKBrVr8BxqJWUj3UdBqJkm e seu endereço imutável permanecem disponíveis para retorno exato. EXE original SHA-256 f76bb9b1d06ed503637caa565c497135737cde01bf52cf4a48efabb3d4e28a50. Cópia independente preserva site, Agent, instalador, payload e hashes.

## Comportamento

Executor local no Worker, separado do motor. Consome somente o futureEntryAnchor final com phase=fired. Em intervalo 30s e analista 30s, seleciona cada sinal; em 60s, seleciona um e pula o seguinte. O intervalo é múltiplo do prazo do analista e não altera a duração da operação. Nenhum sinal já exibido no momento de ligar é executado. Não há repetição de clique ou entrada atrasada para compensar sinais perdidos.

Controles no card do PC: valor fixo, intervalo, parada após minutos, stop loss monetário e conta DEMO/REAL. Desligado por padrão e após reinício. Escolha da conta precisa corresponder à conta confirmada do agente e ao rótulo visível no painel. A configuração fica em arquivo local, sem criar tabelas nem gravar operações no Supabase. Paradas do bot não pausam o analista; pausar o analista desarma o bot.

O clique ocorre no painel nativo existente. A confirmação exige request_id da mensagem de ordem enviada pela própria página e ID retornado pela corretora. O encerramento vem de option-closed (profit_amount menos investimento) ou position-changed fechado (close_profit menos invest). Cotações e resultados simulados não contam como liquidação. Falta de confirmação para o bot e preserva a pendência para impedir repetição. Sinais ocorridos enquanto a operação anterior está pendente são descartados.

## Verificação e limites

344 testes do procedimento prebuild passaram, incluindo 17 testes do executor. O teste com navegador Chromium usa HTML local controlado, não uma sessão autenticada de IQ Option ou Exnova. Verificou CALL e PUT, valor enviado ao controle, alternância 60s, duração divergente, divergência de conta e ausência de erro de página. O caminho de observação dos sockets existentes foi exercitado com eventos controlados de CDP e Playwright.

Não houve operação em conta DEMO ou REAL da corretora, nem lançamento nativo do EXE em Windows. Nenhuma afirmação de ganho de assertividade. Os rótulos e formatos reconhecidos precisam corresponder à interface efetivamente aberta; em interface ambígua o executor não clica e exibe o erro. Duração deve estar expressa em segundos/minutos no painel da corretora. Expiração absoluta por relógio não é convertida ou presumida. Isso precisa ser validado em cada modalidade da sessão real do usuário.

runtime.mjs, now-opportunity-engine.mjs, runtime-market.mjs, remote-relay.mjs, remote-status.mjs e signed-live-bridge.mjs são byte a byte iguais à base. O launcher Go e o instalador PowerShell também permanecem iguais. Não se adicionou timer, consulta de mercado, subscription, tabela, RPC nem envio recorrente para o Supabase. O executor só inspeciona os controles durante ativação e em uma decisão selecionada; a promessa do navegador não bloqueia o scheduler de cotações. Isso não equivale a medição de custo ou desempenho no Windows do usuário.
