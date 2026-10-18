# Investigação do saldo e da decisão — 18/10/2026

Base: Sentinel 13.9.37, commit `21f43a9587e2a4f6cdb23933226b4b0f0520e466`. Correção preparada em branch de investigação; nenhuma publicação nova. Regras de previsão em produção preservadas.

## Saldo

Reproduzida uma inconsistência do leitor: o observador aceita o evento `balance-changed` em envelope, mas o parser só procurava os valores diretamente em `msg`, ignorando `msg.body`. Assim, um evento recebido não atualizava o saldo nem o cache; a consulta periódica de contas ocorre a cada 30 segundos quando já existe saldo.

A correção lê o corpo do evento, preservando a seleção por ID da conta. Não calcula saldo, não envia ordens, não aumenta consultas e não altera o instalador. Quatro testes novos falharam antes e passaram depois: Exnova e IQ Option, ingestão direta e sockets restaurados/fallback, atualização antes da próxima cotação, preservação após cotação, isolamento de outra conta e saldo zero. Suíte completa: **300 testes passaram, zero falhas**.

Limite: são frames construídos para reproduzir o defeito no código, não uma captura da sessão do usuário. Isso não confirma que seja a única causa do congelamento observado, nem que a interface nativa da corretora tenha sido testada.

## O motor usa apenas a última vela?

Instrumentei as camadas de decisão e preservei exatamente as entradas publicadas da 13.9.37. Em 15 janelas externas, todos os 643 sinais tinham pelo menos 50 velas históricas disponíveis.

Para isolar o efeito do histórico OHLC, mantive os mesmos ticks recebidos, preço atual, projeção selecionada e instante, alterando somente a quantidade de velas entregue às camadas estruturais. São decisões hipotéticas nos mesmos instantes, **não novos replays completos de uma estratégia com menos velas**.

| Velas históricas mantidas | Mesma direção liberada | Direção oposta liberada | Sinal não liberado |
|---|---:|---:|---:|
| Nenhuma | 190 | 25 | 428 |
| 1 | 190 | 25 | 428 |
| 3 | 193 | 25 | 425 |
| 10 | 241 | 23 | 379 |
| 20 | 405 | 19 | 219 |
| 50 | 514 | 7 | 122 |

Portanto, o histórico altera a liberação ou o lado em 453 de 643 pontos quando reduzido a uma vela. A hipótese literal de que só a última vela conta não é sustentada neste replay. Das 630 entradas com última vela fechada não neutra, 329 seguiram sua cor e 301 foram contra. Associação de cor não demonstra causalidade.

O ponto fraco continua na interpretação da reação: uma condição local de rejeição pode autorizar uma previsão de 30 segundos sem evidência suficiente de que a reação persistirá. Há também amostras de padrões com resultados de 30 segundos sobrepostos, de modo que concordância dos exemplos não é probabilidade de acerto calibrada.

## Candidato descartado

O código permite que camadas posteriores reavaliem uma decisão aguardando conflito. Testei preservar os vetos históricos explícitos, exceto quando uma sequência confirma mudança estrutural. Em replays completos, **nenhuma entrada mudou**: nenhum sinal emitido passou pelo veto específico testado. Não há evidência para apontar esse caminho como causa dominante ou publicar esse candidato como melhoria.

Resultado externo completo de ambos: **306 acertos, 318 erros, 19 empates, nenhum vencimento sem preço; 49,04% sobre 624 resultados não empatados**. O vídeo extraído conhecido permaneceu em 11 acertos, 3 erros e um vencimento sem preço. Não misturo os dois resultados.

Todos os dados já haviam sido examinados; não são validação inédita. Forex histórico externo não estabelece a assertividade do OTC da corretora. O vídeo extraído não contém histórico OHLC verificado para avaliar os 100 níveis. Nenhuma promessa de 90% ou de eliminação de perdas foi validada.

Reprodução: `node scripts/sentinel-decision-priority-ab-20261018.mjs`. O relatório bruto completo está comprimido em `sentinel-decision-priority-ab-20261018.json.gz`; o resumo legível por máquina está em `sentinel-balance-and-decision-priority-20261018.json`.
