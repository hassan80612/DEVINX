# Investigação do motor — 18/10/2026

Estado: correções preparadas e testadas; produção permanece na 13.9.37. Nenhum instalador foi reconstruído ou publicado nesta investigação.

## Falhas concretas corrigidas

1. Velas recebidas com atraso podiam substituir uma cotação mais nova e receber a hora de chegada como se fossem preço atual. O driver agora preserva a hora do evento, rejeita regressão temporal e mantém a alternativa de leitura em fluxos que só entregam velas. Não há temporizador adicional, chamadas de rede ou novo acúmulo de histórico.
2. Um sinal da corretora anterior podia permanecer ao trocar de corretora com o mesmo símbolo. A chave de contexto agora inclui a corretora. Resultados só são avaliados com o mesmo ativo e corretora; os contadores exibidos também respeitam a estratégia e o prazo atuais.
3. A correção de leitura de saldo após liquidação em envelopes aninhados, preparada no checkpoint anterior, permanece incluída na cópia de trabalho.

## Evidência reproduzível

- Regressão integrada: 327 testes, 327 passaram, zero falhas. Inclui os testes obrigatórios extraídos de prebuild e o fluxo passivo da página.
- Proveniência de cotação: 12 testes novos falhavam antes e passam depois.
- Isolamento de mercados: quatro defeitos reproduzidos antes; cinco testes passam depois, incluindo a preservação do sinal por 30 segundos no mesmo mercado.
- Replay de falha de entrega, com preços reais EUR/USD de 30/03/2020 às 19h UTC: 29 velas fechadas entregues depois de uma cotação mais recente. A versão antiga promoveu 29 preços incorretamente a atuais e desviou quatro entradas da referência limpa. A corrigida teve zero promoções e zero entradas divergentes; preservou exatamente as 43 entradas da referência, inclusive horários, direção, preço e vencimento. Resultado idêntico nos dois adaptadores de corretora, sobre a mesma trajetória de mercado; não são duas amostras independentes de mercado.

Isso comprova a correção dos defeitos reproduzidos. Não comprova que todas as perdas da sessão do usuário tenham essa causa nem uma taxa de acerto de 90%. A falha foi injetada de forma controlada em dados Forex externos, não em uma captura dos eventos OTC da sessão do usuário. Não foi executado um teste nativo do instalador Windows nesta etapa.

## Pesquisa de previsão: candidatos rejeitados

Cinco remoções isoladas de componentes foram comparadas com o motor lançado. Nenhuma cumpriu os critérios declarados antes da execução de ganho, preservação do vídeo e frequência de sinais. Os períodos reservados para uma eventual vencedora não foram consumidos.

Também foram treinados modelos diretamente sobre resultados encerrados de 30 segundos, com 643 amostras anteriores ao meio-dia e 41 características causais de cotações e velas fechadas. Uma regressão logística melhorou a validação de 44,16% para 50,65%; mais tarde no mesmo dia passou de 50% para 51,30%; em outro dia caiu de 56% para 46%. Foi rejeitada. São avaliações de direção nos horários de entrada originais, sem integração desse modelo ao motor. A disponibilidade de características foi parcial e está registrada por entrada. A pequena amostra de vídeo não tinha as 50 velas verificadas exigidas pelo modelo, portanto não valida esse aprendizado.

Não há ganho de assertividade real demonstrado nesta etapa. A alteração mantida é a correção de integridade e isolamento dos dados, sem trocar a lógica direcional por uma hipótese que piorou fora do período de treinamento.

## Reprodução

Na raiz do repositório, execute os arquivos node --test presentes no prebuild de sentinel-trading-lab/package.json; o relatório também inclui tests/sentinel-page-passive.test.mjs.

O replay da falha é scripts/sentinel-delayed-candle-fault-replay-20261018.mjs. Ele usa a cópia congelada e compactada do driver 13.9.37 presente nas fixtures para comparar com o driver corrigido. Não exige a pasta de trabalho antiga.

Arquivos JSON grandes são preservados em .json.gz: descompacte para os nomes .json originais antes de executar novamente os scripts de pesquisa. Os scripts e as especificações registram as divisões temporais, parâmetros, critérios e limitações. O modelo de pesquisa exportado não é usado no agente.
