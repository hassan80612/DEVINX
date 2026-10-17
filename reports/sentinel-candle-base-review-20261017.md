# Base de velas e estabilidade da projeção — 2026-10-17

## Resultado e estado

Nenhuma alteração foi publicada. A referência continua sendo 406c8f6b7ffa6fa90cad6575c0903ba78205b697. A candidata da fonte de velas corrige um defeito de dados reproduzido, mas não demonstrou ganho consistente de assertividade e permanece isolada.

## Defeito concreto reproduzido

O armazenamento de mercado do worker (`mergeCandles`) usa apenas o início da vela como chave. Uma vela de 1 minuto e outra de 5 minutos podem começar no mesmo instante e substituir uma à outra. O worker também já mantém `predictionCandles`, cuja chave separa intervalo e início e preserva ambas.

O motor atual passa somente `snap.candles` ao contexto histórico. O pool preservado chega ao snapshot, mas não é usado nessa chamada. Portanto, em um teste de protocolo com 100 velas nativas de 1m e 20 de 5m recebidas, a análise vê apenas 80 velas de 1m. A janela de 100 e a EMA100 ficam indisponíveis apesar de os dados já terem sido recebidos.

Isso foi reproduzido em IQ Option e Exnova com os parsers reais. Não estabelece que essa seja a causa da assertividade relatada na sessão atual, cujo tráfego não foi capturado.

## Correção isolada

A candidata usa os dois conjuntos já existentes, priorizando correções atuais para a mesma combinação de período/início. O validador histórico continua descartando velas inválidas ou em formação, agrupando por período e escolhendo uma série homogênea de até 100 velas. A origem não verificada continua bloqueada.

Não faz novas requisições, não cria velas, não adiciona histórico à sessão e não altera o contador. Nenhum parâmetro de CALL/PUT é trocado por essa regra; as decisões podem mudar porque os níveis históricos passam a receber dados diferentes.

Integração proposta na chamada do runtime:

    candles:structuralCandleInput(snap),structureCache:this.structureCache,

O módulo e a integração executável estão em `experiments/verified-candle-source-20261017.mjs` e `experiments/candle-source-research-runtime-20261017.mjs`. O segundo cria uma cópia temporária isolada do core. O runtime publicado permanece inalterado.

## Testes e comparação

Cinco testes passaram:

1. IQ Option: protocolo → adapter → runtime recupera as 100 velas nativas, em lugar das 80 da fonte truncada.
2. Exnova: mesma recuperação.
3. Correções atuais prevalecem; velas inválidas e em formação são excluídas.
4. História não verificada não entra; pool ausente ou vazio preserva a fonte anterior.
5. Em uma série de um único período, observações e o ciclo de entrada/vencimento ficam idênticos.

Nos dois extratos do vídeo já usado, não houve mudança de decisões nem entradas: 11/3 na extração fina e 10/3 na grossa, excluindo uma entrada sem vencimento coberto em cada extrato. São dois extratos da mesma sessão e não são validações independentes. O vídeo disponível não fornece o pool nativo histórico de 100 velas; esses replays não medem o efeito principal da correção.

Três sessões geradas de 15 minutos passaram pelo driver, adapter e runtime, com velas nativas simuladas de 1m e 5m coerentes com a mesma trajetória. A candidata coincidiu com a referência de 1m intacta em todas as 2.703 avaliações, tanto na estrutura como na observação e nas entradas.

| Cenário gerado | Fonte atual truncada | Fonte nativa intacta / candidata |
| --- | --- | --- |
| Faixa variável | 21 acertos / 6 erros | 21 / 6 |
| Viradas bruscas | 28 / 1 | 28 / 1 |
| Troca de tendência | 22 / 7 | 18 / 11 |

Uma entrada sem vencimento coberto foi excluída em cada série. Na troca de tendência, a candidata também elevou a maior sequência de perdas de duas para três. Essa regressão impede apresentar a correção da fonte como melhoria comprovada de assertividade. Os números de trajetórias geradas não estimam o desempenho real do produto.

Foram conferidas 322 entradas nas comparações: prazo de 30 segundos e nenhuma sobreposição. Os testes cobrem a mudança efetiva de horário causada pelas novas informações; comparar apenas a direção nos antigos horários teria ocultado parte do efeito.

## Custo medido no host

No componente de contexto histórico já em cache, a mediana intercalada passou de aproximadamente 0,045 para 0,070 ms no caso 100+20. Com oito períodos de 240 velas no pool existente e 400 velas na fonte corrente, passou de 0,071 para 0,209 ms. O p95 da candidata nesse limite foi 0,449 ms. Não são medições de Windows, FPS do gráfico ou latência completa do analista.

## Outras hipóteses descartadas nesta rodada

Combinar projeções em janelas de 90, 120 e 180 segundos piorou o vídeo fino de 11/3 para 10/4; suspender a projeção quando as duas janelas menores discordavam piorou para 8/4. Nos oito cenários artificiais, as variantes também tiveram regressões. Foram aprovados três testes de equivalência do runtime isolado e causalidade das duas variantes, mas a aprovação técnica não representa ganho preditivo.

Uma terceira variante restringiu a suspensão a alternância intensa de preço, medida pela razão entre percurso observado em 1s e 5s nos últimos 90s. Piorou o vídeo fino para 9/4 e aumentou a sequência de perdas; o teste parou antes de rodar novos cenários, conforme critério registrado. Nenhuma dessas regras foi incorporada ao agente.

## Reproduzir

    node --test tests/sentinel-candle-source-context.test.mjs
    node scripts/sentinel-candle-source-audit-20261017.mjs
    node scripts/sentinel-candle-source-cost-20261017.mjs

Os scripts das hipóteses rejeitadas e os JSON completos foram preservados nesta branch para evitar repetir os mesmos experimentos e confundir seus resultados com melhorias publicadas.
