# Sentinel 13.4.67 — diagnóstico quantitativo: oscilação, reversão e falhas de previsibilidade
**Data:** 2026-10-11  
**Status:** PESQUISA — NÃO PUBLICAR NO SITE OU AGENT. A base 13.4.67 continua no SHA `5c20afbef3060d00a5caa52cf0498aebff6b20c9`.

## Evidência encontrada no código, não suposições

### 1. O 67 não estima a fase da oscilação
`automatic-forward-model.mjs` estima inclinações históricas curta/média/longa, eficiência do caminho e extremos de preços. `specialist-forward-models.mjs` opera com pernas/tendência, média e nível conforme motor. `historical-forward-analogs.mjs` compara apenas três inclinações, eficiência e posição dentro do intervalo; **não descreve o período da oscilação, a fase, os últimos pivôs e a estabilidade do ciclo**.

Consequência: o estado do movimento no topo/fundo da onda pode ser semelhante em variáveis agregadas mesmo que os próximos 5–300 segundos tenham comportamento diferente.

### 2. Alvo indireto: diferença entre dois endpoints
`future-entry-schedule.mjs` calcula P(t+H) e P(t+2H) separadamente a partir do mesmo motor; escolhe CALL ou PUT pelo sinal de log(P(t+2H)/P(t+H)). Os dois erros de preço afetam a direção projetada. `historical-forward-analogs.mjs` aprende resultados históricos **t->t+H**, não resultados emparelhados **t+H->t+2H**.

### 3. Historicamente limitado a 2.400 *cotações*, não segundos
`runtime.mjs` ao receber mercado externo aplica:
`market.quoteHistory.filter(...).slice(this.settings.engine?-2400:-900)`.
Se o feed fornecer 4 cotações/segundo, o histórico retido é, no máximo, cerca de 600 segundos. Isso pode ser insuficiente para várias ondas completas de 300 segundos, muito menos para 600–3600s. A implementação definitiva precisa usar um buffer local multirresolução baseado em tempo, com limite fixo de memória. Aumentar apenas o tamanho bruto da lista poderia deixar o Agent lento.

### 4. O alvo de validação precisa ser o movimento direto do horário da operação
Uma melhora em erro quadrático de **preço futuro isolado** não garante melhora de **CALL/PUT entre t+H e t+2H**. Essa hipótese foi testada nesta pesquisa e não resultou em ganho global consistente.

## Experimento independente da versão publicada

Modelo novo isolado `vnext-oscillation-phase-research.mjs`. Ajusta série linear + funções senoidais/cossenoidais para diferentes períodos, seleciona o melhor **usando apenas dados históricos antes da previsão**, estima diretamente P(t+H)->P(t+2H), combina a previsão do mesmo motor com peso contínuo derivado da qualidade da fase histórica. Não troca o motor, não atrasa nem bloqueia operações. O modelo nunca interfere com a 67 publicada.

Testes de integridade e cenários passaram em GitHub Actions. Uma falha inicial da grade de frequência foi identificada e corrigida antes do teste final.

**11.592 previsões sintéticas cronológicas**, nove motores, horizontes 5/10/30/60/120/300s, regimes periódicos, ciclo variável, choppy, reversão, falso rompimento, picos e tendência. Cada motor recebe a mesma série de preços, portanto *não* são 11.592 amostras estatisticamente independentes. Não são dados do mercado real e muito menos resultados da IQ Option/Xnova.

| Regime sintético (1.656 cada) | 67 | Fase nova | Diferença (acertos) |
|---|---:|---:|---:|
| Onda periódica | 1.451 | 1.453 | +2 |
| Ciclo evolutivo | 1.329 | 1.330 | +1 |
| **Oscilação irregular** | **848** | 817 | **-31** |
| Viradas e reversões | **1.421** | 1.408 | -13 |
| **Falso rompimento** | 870 | **944** | **+74** |
| Picos isolados | **820** | 795 | **-25** |
| Tendência | 1.378 | 1.383 | +5 |
| **Total** | 8.117/11.592 (70,02%) | 8.130/11.592 (70,13%) | +13 |

**Importante:** ~70% é uma média ARTEFICIALMENTE FACILITADA pelos regimes simulados de ondas periódicas, ciclos previsíveis e tendências. Esse número não representa assertividade no broker.

| Horizonte até entrada | 67 | Modelo de fase |
|---|---:|---:|
| 5s (n=2.394) | 1.610 | 1.639 |
| 10s (n=2.394) | **1.738** | 1.706 |
| 30s (n=2.394) | 1.639 | 1.646 |
| 60s (n=2.394) | **1.769** | 1.752 |
| 120s (n=1.386) | **988** | 986 |
| 300s (n=630) | 373 | **401** |

No cenário choppy: a fase mudou a decisão 233 vezes: recuperou 101 erros, mas transformou 132 acertos da 67 em erros. No falso rompimento: corrigiu 177 erros e criou 103 novos. **Validação por erro de preço histórico, sozinha, não é um critério suficiente para melhorar a direção da operação.**

## Teste de limite de informação (oráculo teórico no processo SIMULADO)

Para estudar se 70–80% são possíveis em oscilações aleatórias, avaliamos um processo gaussiano cuja lei de formação é conhecida exatamente:

- Estado: x(t) = desvio do log-preço do centro, v(t-1)=incremento anterior.
- x(t+1)=x(t)+v(t), onde v(t)=-0,08*x(t)-0,47*v(t-1)+epsilon(t), epsilon~Normal(0, 0,000013).
- Melhor classificador possível **para esse processo** conhece a matriz exata de transição, o estado observado e a variância futura. Para decidir o sinal de x(t+2H)-x(t+H), a melhor taxa média teórica é E[Phi(|mu(x,v)|/sigmaDelta)], calculada pela distribuição gaussiana condicional. Nenhum modelo que tenha somente estas informações pode superar esse limite em expectativa.

| H | Máxima precisão condicional teórica — apenas este processo simulado |
|---|---:|
| 5s | 57,28% |
| 10s | 57,85% |
| 30s | 53,70% |
| 60s | 50,77% |
| 120s | 50,03% |
| 300s | 50,00% |

**Isto não é um teto universal para os mercados.** Demonstra matematicamente por que não faz sentido exigir 80% para *todas* as oscilações sem saber se existe informação preditiva suficiente; um oscilador regular e um processo de oscilação ruidoso não têm a mesma previsibilidade.

## Conclusões e ação recomendada

1. **Não promover a pesquisa de fase**: melhora falsos rompimentos e 300s no conjunto sintético, mas piora oscilação irregular e picos. Não apresenta o ganho geral requerido.
2. Substituir a métrica de treino/seleção por **perda direcional do retorno pareado entre a entrada futura e o vencimento**, avaliada em previsões *já encerradas* e cronologicamente fora da amostra. Não há motivo matemático para otimizar preço isolado se o objetivo é acertar a direção entre dois instantes.
3. Medir observabilidade do feed: idade real das cotações, frequência, lacunas, ativo correto e quanto TEMPO os últimos 2.400 pontos cobrem. Para prazos longos, reter histórico local em múltiplas resoluções com limite de memória (sem aumentar custo de Supabase).
4. Avaliar novas leituras apenas em **cotações reais registradas pela corretora em DEMO** em dias diferentes, preservando períodos de teste intactos e pares entry/expiry exatos. Separar resultado por ativo, motor e prazo, sem selecionar retroativamente o cenário vencedor e sem mascarar decisões difíceis.
5. A meta 70–80% é **hipótese a testar em situações verdadeiramente previsíveis**, não promessa para qualquer regime. **Nunca ocultar erros, impor esperas artificiais ou substituir a 67 sem evidência.**

## Código da pesquisa

- `sentinel-trading-lab/agent/src/core/vnext-oscillation-phase-research.mjs`
- `tests/sentinel-v13467-oscillation-phase.test.mjs`
- `tests/sentinel-v13467-phase-horizon-benchmark.test.mjs`
- `.github/workflows/sentinel-oscillation-phase-research.yml`

A produção original e as suas decisões CALL/PUT permanecem intactas.
