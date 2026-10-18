# Sentinel 13.9.40 — saldo manual e cálculo local

Base publicada: 13.9.39, commit ea53320e1c19091ac9420d0db6916a8e0e87a8ae. A original 13.9.38 continua preservada em backup/sentinel-13.9.38-original-20261018, commit 3d9317181686a5b14bdb57834560d984d9ea375c, deployment imutável dpl_8krxzDhKBrVr8BxqJWUj3UdBqJkm e cópia independente do site/Agent/EXE.

## Correção do bloqueio de partida

O executor não exige leitura do saldo, ID da conta, identificação DEMO/REAL nem rótulo visível de tipo de conta. Esses campos deixaram de ser lidos por executionContext. O painel remove o seletor de conta e recebe saldo inicial e payout (%) manualmente, além de valor por entrada, intervalo, parada em minutos e stop loss. A configuração antiga de accountMode é ignorada na migração. Não se preenche saldo ou payout com dados da corretora.

A detecção de controles agora verifica apenas os botões CALL/PUT e campo de valor; deixou de exigir leitura do controle de duração. O usuário deve configurar na corretora a mesma duração do analista. Um request_id e ID de ordem recebidos da conexão já existente ainda confirmam que a entrada abriu, sem ler saldos ou consultar endpoints de ordens. O ID de conta, quando presente na própria mensagem de ordem, pode ser retido para correlacionar resultados, mas não é requisito de partida.

## Saldo calculado e resultados

A referência de entrada é a cotação já recebida pelo analista imediatamente antes do clique. Um preço explícito de abertura vindo na confirmação da ordem tem prioridade. O vencimento explícito da ordem tem prioridade; sem ele, usa-se a hora do clique mais a duração do analista.

No vencimento, o cálculo utiliza a última cotação recebida até o prazo, com idade máxima de um segundo, reutilizando o histórico de cotações que já alimenta o analista. Não abre feed nem lê o gráfico por DOM. CALL ganha quando o preço de saída é maior; PUT quando menor; igualdade gera zero. Ganho local é valor multiplicado pelo payout informado dividido por cem; perda desconta o valor. O painel identifica isso como saldo calculado e resultado por cotação, sem afirmar que seja o saldo oficial da conta.

Essa apuração é uma estimativa baseada nos preços observados. Arredondamento, preço efetivamente executado, regras de empate e expiração da corretora podem divergir. Não há alegação de resultado financeiro oficial ou assertividade de 100%. Se um encerramento oficial chegar pela conexão já existente, ele substitui a estimativa sem duplicar o resultado. Preços estimados não são reclassificados como preços oficiais quando o evento de encerramento não informa preço. A memória é limitada a 200 operações; o painel apresenta as cinco mais recentes.

O stop loss atua no resultado acumulado local. A parada em minutos foi mantida conforme a correção verbal final do usuário. O intervalo de 60s continua selecionando uma decisão e pulando a seguinte quando o analista está em 30s. Um sinal pode aguardar brevemente a conclusão da entrada anterior enquanto ainda está dentro dos 1500ms de validade; não há execução atrasada para compensar sinais perdidos.

## Evidência

357 testes do procedimento obrigatório passaram, incluindo 30 testes do executor. Cobrem ausência completa de metadados de conta, saldo configurado, payout fracionário, CALL/PUT, perda, ganho, empate, ausência de preço, exclusão de movimentos posteriores ao vencimento, correção oficial tardia, contagem única e stop loss local.

O navegador Chromium exercitou o painel e clique em um HTML local controlado para os dois adaptadores. Campos de saldo/tipo/ID de conta foram instrumentados para lançar erro se fossem lidos; houve zero acessos a esses campos. Foram preenchidos saldo inicial/payout/valor pelo painel, abertas duas ordens controladas, pulada a decisão intermediária e calculados os resultados sem eventos de liquidação. Também se testou correção posterior por evento oficial controlado. Não é uma sessão autenticada real de IQ Option/Exnova. Windows nativo e operações na corretora não foram executados nesta verificação.

O motor, adaptação do mercado, relay, transporte compacto, ponte assinada PC/celular, launcher Go e instalador PowerShell permanecem byte a byte iguais à 13.9.39. Não houve alteração no Supabase, tabela, RPC, streaming ou frequência de consultas. O bot continua desligado por padrão após iniciar ou atualizar o Agent.
