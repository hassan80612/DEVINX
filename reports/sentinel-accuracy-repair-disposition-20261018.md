# Tentativa de corrigir a assertividade — resultados e limite atual

**Não foi obtida uma correção confiável. As hipóteses testadas foram rejeitadas; bot e analista publicados permanecem intactos.**

Base: 13.9.43, commit `32ba17004713a085ac8f0e16adc28da739896634`. Os 75 arquivos do núcleo do analista continuam idênticos ao publicado. Nenhuma ordem financeira, alteração de banco de dados ou publicação foi feita.

## Hipóteses e ordem de avaliação

1. **Cronologia da rejeição.** Um extremo do contexto de 12 segundos pode ter ocorrido antes da origem de aproximação de 6 segundos e ser reconhecido como toque atual. A cópia corrigida restringe o extremo da rejeição à aproximação que está sendo julgada; preserva tolerâncias, rompimentos e ciclo de 30 segundos. Essa hipótese anterior foi retomada explicitamente com suas pendências, não apresentada como novidade validada.
2. **Calibração fixa da direção final por rota.** Uma regra foi treinada somente nas 14 janelas conhecidas de EUR/USD de 30/03/2020: média de Jeffreys Beta(0,5;0,5), pelo menos 30 resultados por rota; testar o lado oposto quando a média de acertos original fica abaixo de 50%. Isso selecionou padrões locais e rejeições de velas. Modelo, contagens e regra ficaram fixos antes de avaliar os novos dados. Não é uma probabilidade futura comprovadamente calibrada.
3. **Aprendizado recente por rota, exploração posterior.** Depois do teste novo, foi avaliada uma hipótese adicional nos dados já conhecidos: para a mesma sessão/rota, usar somente entradas já vencidas, manter os últimos 24 resultados do lado original e, após 12, inverter se esse lado perdeu mais do que ganhou. Não muda horários, preços, duração ou admissão. É um contrafactual causal sobre as entradas originais, não uma integração de produção nem validação inédita. O resultado foi negativo e não foi ajustada outra constante.

## Desenvolvimento conhecido

Em 15 trechos já inspecionados de EUR/USD externo:

| Variante | Acertos | Erros | Empates | Acerto sem empates |
|---|---:|---:|---:|---:|
| Atual | 306 | 318 | 19 | 49,04% |
| Cronologia corrigida | 307 | 309 | 21 | 49,84% |

O pequeno avanço retrospectivo não resolveu o desempenho. A correção melhorou cinco trechos e piorou dois. Manter todas as entradas subsequentes no replay evita chamar a simples retirada de perdas de melhoria do motor completo.

## Validação separada

Quatro janelas oficiais de Forex em 01 e 02/04/2020 foram registradas antes da avaliação. Os oito arquivos horários necessários retornaram HTTP 429; nenhuma dessas janelas ficou completa e nenhuma foi avaliada. Os erros estão preservados no relatório de proveniência.

Antes de inspecionar resultados alternativos, foram fixados nove trechos: BTCUSDT, ETHUSDT e SOLUSDT, de 15 a 17/10/2025, sempre das 15h às 15h30 UTC. São arquivos oficiais Binance de candles de 1 segundo, com hashes SHA256 conferidos contra os arquivos CHECKSUM publicados. Todos os nove downloads foram concluídos. O preço é o fechamento observado de cada segundo na fronteira em que o candle termina; não é tick de bid nem operação OTC. Não se interpola um caminho dentro do segundo. Candles de um minuto agregam somente segundos completos e são disponibilizados após o fechamento do minuto.

| Variante | Acertos | Erros | Empates | Acerto sem empates | Maior sequência de erros por trecho |
|---|---:|---:|---:|---:|---:|
| Atual | 300 | 228 | 3 | 56,82% | 6 |
| Cronologia corrigida | 295 | 234 | 3 | 55,77% | 6 |
| Direção recalibrada nas duas rotas | 285 | 243 | 3 | 53,98% | 9 |

A cronologia não melhorou nenhum dos nove trechos: sete permaneceram iguais e dois pioraram. A inversão melhorou quatro e piorou cinco; conservou exatamente todos os horários, preços e vencimentos, verificados por asserção no replay. A melhora em alguns ativos não sustentou uma regra geral.

| Dia | Atual | Cronologia | Inversão por rota |
|---|---:|---:|---:|
| 15/10/2025 | 53,37% | 53,37% | 54,49% |
| 16/10/2025 | 55,11% | 54,55% | 48,86% |
| 17/10/2025 | 62,07% | 59,43% | 58,62% |

Com entradas hipotéticas de uma unidade e payout fixo de 86%, apenas como ilustração matemática, os totais seriam +30,00, +19,70 e +2,10 unidades, respectivamente. Não são lucros executados, não simulam saldo limitado, spread, taxas, clique, liquidação da corretora ou as bancas do usuário. As hipóteses falharam no requisito de melhorar a base na validação, embora esse trecho externo específico tenha resultado positivo no modelo atual.

## Exploração do aprendizado recente

| Dados já conhecidos | Atual | Aprendizado recente |
|---|---:|---:|
| Forex, acertos/erros | 306/318 | 302/322 |
| Cripto, acertos/erros | 300/228 | 296/232 |

Essa terceira hipótese também foi rejeitada no próprio desenvolvimento. Ela não recebeu uma falsa descrição de validação independente, nem foi colocada no agente. O registro de resultados originais evita o erro de aprender a qualidade do lado invertido como se ainda fosse a do lado original.

## Verificação e limites

Sete testes da cronologia, quatro da calibração fixa e três do modelo recente passaram. Na suíte antiga de integração da cronologia, 40 testes passaram e dois falharam, pois fixtures controlados esperam reações históricas que deixam de existir com a regra corrigida. As asserções antigas não foram apagadas nem adaptadas para ocultar falhas. Isso é uma pendência adicional da hipótese, e não evidencia ganho de mercado.

O avaliador consulta o vencimento só depois que o motor decidiu. A calibração fixa não usa resultados dos dias novos no treino. O aprendizado recente só recebe resultados vencidos antes da próxima decisão. Empates e vencimentos ausentes são separados; nenhum vencimento faltou nos trechos novos.

As amostras externas não reproduzem USD/BRL OTC ou outra sessão atual da IQ/Exnova. O usuário relatou cinco bancas chegando a zero, mas não temos a sequência completa de sinais, horários, preços e duração efetiva dessas sessões. A diferença entre 49,04% no Forex conhecido e 56,82% na cripto nova reforça que um percentual de outro mercado não diagnostica automaticamente o OTC atual.

**Não é correto afirmar que a assertividade foi resolvida.** O dado que falta para atribuir os erros atuais é um registro da sessão real da corretora: contexto da estratégia, cotações/candles recebidos, sinais e vencimentos. As mudanças de sinal propostas aqui não têm base para publicação como solução; os resultados, códigos e falhas ficam preservados para não repetir essas tentativas como se fossem novas.

## Reprodução

- `python scripts/sentinel-accuracy-repair-fetch-20261018.py` — registra a falha dos arquivos oficiais de Forex quando persistir HTTP 429.
- `python scripts/sentinel-accuracy-repair-binance-20261018.py` — baixa e confere os nove arquivos oficiais fixados.
- `SENTINEL_REPAIR_SET=crypto node scripts/sentinel-accuracy-repair-ab-20261018.mjs` — compara as três variantes. O modo conhecido original foi executado antes de adicionar a calibração; sua reprodução atual inclui também essa terceira variante, sem alterar as duas primeiras.
- `node scripts/sentinel-online-route-screen-20261018.mjs` — triagem exploratória causal nos resultados já conhecidos.
- `node --test tests/sentinel-ordered-rejection.test.mjs tests/sentinel-final-route-calibration-20261018.test.mjs tests/sentinel-online-final-route-20261018.test.mjs`

Fontes: [Binance Public Data](https://github.com/binance/binance-public-data), com formato dos candles, unidade temporal desde 2025 e verificação CHECKSUM; os URLs e hashes exatos de cada arquivo estão em `sentinel-accuracy-repair-binance-data-20261018.json`. Relatórios brutos completos são preservados em `.json.gz`.
