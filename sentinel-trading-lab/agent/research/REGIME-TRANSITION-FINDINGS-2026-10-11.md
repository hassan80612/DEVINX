# Sentinel 67.2 — investigação de comportamento, retração e extremos

**Resultado: não demonstrou avanço significativo para substituir a versão publicada.** Comparar situações semelhantes melhorou o total real em 22 acertos de 2.208 oportunidades (+1,00 ponto percentual), mas piorou um dia de BTC e a leitura de reversões. A escolha adaptativa foi mais conservadora, com +11 acertos (+0,50 ponto), mas regrediu em 30s, 300s, oscilações e um dia de ETH. Nenhuma variante resolveu os extremos.

Pesquisa isolada em `sentinel-672-regime-transition-lab-20261011`. Versão publicada permanece 13.4.67.2 build `13.4.67.2-strategy-copy-1011`, commit `66c42ff6da4e7af7268a933b9ff83ddfe0b9be90`. Nenhuma publicação, alteração de interface, Supabase ou operação na corretora.

## O que o código mostrou

1. A estratégia publicada já usa histórico, aceleração, posição na faixa, eficiência e volatilidade. Ela não é apenas uma leitura da vela atual. Entretanto, aprende uma única relação linear para todos esses contextos. A primeira hipótese foi aprender respostas diferentes conforme o comportamento observado.
2. A seleção de parâmetros minimiza erro quadrático do retorno previsto. Isso favorece estimar o tamanho do movimento; não otimiza diretamente acertar CALL/PUT. A pesquisa mostrou que reduzir erro de preço e melhorar direção são objetivos distintos.
3. Os extremos publicados são o mínimo e o máximo de aproximadamente oito pontos de uma trajetória média prevista. O treinamento não tem um alvo específico para o máximo, mínimo ou horário desses eventos. A média de trajetórias não equivale à distribuição de possíveis topos/fundos. Densificar a mesma trajetória, na pesquisa anterior, também não resolveu o problema.
4. O teste não confirma que classificar o mercado seja suficiente. A estratégia com sinais de transição ganhou apenas 7 acertos reais no total e piorou BTC. Diagnósticos de regime continuam hipóteses observadas, não conhecimento do próximo movimento.

## Comparação congelada

Antes dos resultados foram fixadas três hipóteses, os parâmetros, os dias e as sementes. As mesmas cotações e horários foram usados em cada comparação. Não houve seleção posterior de operações para inflar o total. Cobertura: 100%.

- Simulações: 1.440 casos, dez comportamentos, incluindo mudanças imprevisíveis e perda gradual de força da tendência. Base 67.2: **72,99%**.
- Preços reais externos: **2.208 previsões**, BTCUSDT e ETHUSDT, quatro dias de cada ativo (03, 04, 07, 08/10/2026), arquivos de 86.400 barras de 1s com checksum original verificado.
- Alvo: previsão emitida em T, preço de entrada T+H, vencimento T+2H. Prazos 5, 10, 30, 60, 120, 300 segundos, 1h de histórico. Barra fechada só fica observável após seu fechamento.
- **279 preços sem mudança** são apresentados como empates e nunca como vitórias. Total real base: **43,43%** incluindo esses casos; **49,71%** entre os 1.929 movimentos com direção.
- Esses números não são a taxa da IQ Option/Exnova, não estimam a taxa observada pelo usuário e não medem execução ou lucro.

| Hipótese | Simulação | Real, todos os casos | Real, sem empates | Erros corrigidos | Acertos perdidos |
|---|---:|---:|---:|---:|---:|
| Contexto semelhante | 72.99% | 44.43% | 50.86% | 126 | 104 |
| Sinais de transição | 73.47% | 43.75% | 50.08% | 127 | 120 |
| Escolha adaptativa | 73.47% | 43.93% | 50.29% | 47 | 36 |

## Ganhos e perdas por prazo, em preços reais

| Prazo | 67.2 | Contexto semelhante | Sinais de transição | Escolha adaptativa |
|---|---:|---:|---:|---:|
| 5s | 32.88% | 32.61% | 33.15% | 33.42% |
| 10s | 38.59% | 39.95% | 37.77% | 39.67% |
| 30s | 48.10% | 49.73% | 46.47% | 47.55% |
| 60s | 47.55% | 48.37% | 46.74% | 47.83% |
| 120s | 45.11% | 47.83% | 48.37% | 47.01% |
| 300s | 48.37% | 48.10% | 50.00% | 48.10% |

Por ativo, a escolha adaptativa passou de 477 para 485 acertos em BTC e de 482 para 485 em ETH (1.104 oportunidades cada). Melhorou seis dos oito arquivos, empatou um e piorou um. O ganho é pequeno.

Contexto semelhante melhorou sete arquivos e piorou BTC em 08/10 (48,91% para 46,74%). Para reversões em 786 casos reais, a base foi 49,75%; contexto semelhante 49,24%; sinais de transição 50,64%; escolha adaptativa 49,62%.

O intervalo descritivo de ganho, usando reamostragem por arquivo para respeitar correlação dos prazos, foi de -0,14 a +2,04 pontos para contexto semelhante, -1,45 a +1,86 para sinais de transição e +0,05 a +0,91 para a escolha adaptativa. Apenas oito arquivos externos: isso é evidência limitada, não garantia de ganho futuro. Comparações entre três hipóteses também introduzem multiplicidade; não se deve tratar a melhor como superior comprovada.

## Extremos

Os prazos 5s e 10s cabem inteiros na tolerância de ±10s, por isso o agregado que os inclui dá uma impressão excessivamente favorável. O recorte útil abaixo considera apenas 30s, 60s, 120s e 300s: 1.472 casos.

| Horário do extremo dentro de ±10s | 67.2 | Contexto semelhante | Sinais de transição | Escolha adaptativa |
|---|---:|---:|---:|---:|
| Topo | 26,15% | 26,09% | 25,48% | 25,68% |
| Fundo | 27,45% | 29,21% | 28,40% | 28,06% |

O horário do topo piorou no total; o fundo melhorou pouco. Não está resolvido.

Contexto semelhante reduziu o erro médio de preço do topo de 12,10 para 10,37 pontos-base e do fundo de 11,70 para 9,58 (agregado de seis prazos), porém isso não trouxe melhora equivalente no horário ou na direção.

## Conclusão técnica e próxima hipótese delimitada

Separar comportamentos melhora um pouco a estimação de preços, mas não apresentou o avanço desejado para CALL/PUT ou extremos. O próximo teste estruturalmente distinto seria treinar diretamente o sinal do retorno entre entrada e vencimento e alvos separados para reversão/máximo/mínimo e seus horários, mantendo uma trajetória para exibição. Isso requer novo conjunto de avaliação, sem otimizar contra os resultados deste relatório. Não foi implementado nem demonstrado por esta pesquisa e não é promessa de assertividade.

## Verificação e reprodução

- Cinco contratos passaram: intervalo direto exato, controle igual à 67.2, resultados históricos completos e purgados, rejeição de futuro/backfill, independência de rótulos e invariância à densidade de ticks.
- O controle global reproduziu exatamente o retorno previsto e a trajetória da versão publicada em todos os 3.648 casos.
- A comparação de Git comprovou que código de produção, interface, controles, instalador e versão ficaram intactos.
- Execução: https://github.com/hassan80612/DEVINX/actions/runs/38185037869
- Plano previamente congelado: [REGIME-TRANSITION-FROZEN-2026-10-11.md](REGIME-TRANSITION-FROZEN-2026-10-11.md).
- Métricas: [simulações](REGIME-TRANSITION-SYNTHETIC-2026-10-11.json), [preços reais](REGIME-TRANSITION-EXTERNAL-2026-10-11.json). O JSON de simulações preserva métricas gerais, por contexto/prazo e contagens pareadas por fonte; detalhes completos e decisões por caso constam no artefato da execução, com retenção de 14 dias. Scripts e sementes permitem reprodução.
- Fonte de dados: arquivos públicos de https://data.binance.vision/data/spot/daily/klines/ (BTCUSDT e ETHUSDT, 1s).
- Referências técnicas: https://www.quantconnect.com/docs/v2/writing-algorithms/key-concepts/research-guide ; https://www.quantconnect.com/docs/v2/research-environment/applying-research/hidden-markov-models ; https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html . O protótipo usa características contínuas observáveis, não HMM nem estados retrospectivos suavizados.
