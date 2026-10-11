# Sentinel 13.4.67: revisão técnica dos NOVE motores, falhas comprovadas e referências externas
**11/10/2026 — documentação da pesquisa, NÃO uma versão operacional.**

## Status e responsabilidade
- **Produção preservada**: commit `5c20afbef3060d00a5caa52cf0498aebff6b20c9`.
- Nenhuma das alterações propostas nos motores foi integrada ao Agent instalado, site, overlay ou ordens.
- Resultado de 75-80% e reversão/oscilações 100% corrigidas **não foi demonstrado**. Não atribuir taxa de acerto a um recurso somente por passar nos testes de software.
- Banco de dados de ticks real da própria IQ Option/Xnova ainda não está presente para backtesting legítimo, com o feed e prazos reais e resultado da operação.

## A falha estrutural de todos os motores

1. `future-entry-schedule.mjs` atual: para entrada em T+H, estima P(T+H) e P(T+2H) **separadamente**, depois extrai o CALL/PUT de `log(P(T+2H)/P(T+H))`. Uma leitura comum dos dois modelos de preço não equivale a um modelo condicionado à direção desse período.
2. `historical-forward-analogs.mjs` aprende o retorno de `T->T+H` com três inclinações, eficiência e posição, e não a direção `T+H->T+2H`. Os 9 motores utilizam essa família de analogias com pesos diferentes; **não representam 9 fontes independentes de evidência**.
3. `runtime.mjs` corta o histórico em `slice(-2400)` quando existe um motor selecionado: são **2.400 cotações, não segundos**. O mesmo gráfico com 4 ticks/s perde três quartos de seu alcance temporal. Nem a própria série histórica de 300 segundos fica sempre adequada para confirmar múltiplas oscilações.
4. Motor Price Action usa a quantidade de ticks (`last.length`) dentro da fórmula que converte perna em horizonte (`Math.min(h / Math.max(5,last.length),3)`). **Erro dimensional concreto**: quantidade de amostras não é duração em segundos. A amostragem do feed altera a previsão mesmo se a curva de preços permanecer exatamente igual.
5. Em vários motores, `stats()` usa média, variância e eficiência ponderadas pela quantidade de ticks recebida em vez de unidade de tempo. Um feed irregular pode distorcer todos os indicadores estatísticos que dependem da distribuição dos registros.

## Diagnóstico detalhado de cada motor e correção legítima

| Motor original | Fragilidade identificada em fonte | Correção candidata (não promovida sem validação) |
| --- | --- | --- |
| Automático | Multiplica inclinações com persistência estática; níveis extremos brutos; não estima fase de reversão | Aprender retorno futuro pareado e erro de mudança de regime, usando dados com timestamp válido |
| Price Action | **Perna temporal indexada por número de ticks; erro reproduzido no teste 1Hz vs 4Hz** | Calcular durações efetivas `ts`, não `length`; avaliar estrutura de rejeição com múltiplos pivôs confirmados historicamente |
| Suporte e Resistência | Min/max únicos de até 180s; sensível a picos isolados; gatilho percentual `.85/.15` fixo | Zonas de reação com recorrência, distância normalizada pela volatilidade e retestes registrados no passado |
| Trend Following | Inclinações fast/mid/long multiplicadas por fator de eficiência, mas sem persistência calibrada para cada horizonte e regime | Estimar meia-vida da tendência e variação da volatilidade por H; medir falhas de término antecipado |
| Mean Reversion | Média/variância de amostras pode mudar com taxa de ticks; pressupõe retorno à média mesmo se tendência romper o centro | Média e variância temporais; medida robusta de deslocamento de nível e velocidade real de retorno |
| Breakout | Compressão/proximidade da faixa bastam para extrapolar; não sabe diferenciar rompimento persistente de falso rompimento | Estimar sobrevivência e rejeição após romper extremos prévios, com dados cronológicos e sem olhar a vela do futuro |
| Trendline Breakout | `regress(chunks)` usa último ponto de cada intervalo de amostras, não pivôs estruturais ou linhas de toque | Construir linhas com pivôs CONFIRMADOS e timestamps, medir reprovação das linhas em tempo de teste |
| Fibonacci Retest | `hi/lo` e direção do conjunto anterior, sem identificar o último swing confirmado; níveis quase decorativos | Confirmar swing e traçar retrações sobre pivôs passados; medir reação condicional direta para H |
| Smart Confluence | Agrega inclinações e pressão de média com pesos fixos; falta modelagem de fase, rompimento falso e causalidade do prazo | Ajustar contribuições internas do próprio motor em erros passados completos do mesmo horizonte |

## Testes objetivos que já passaram

Teste metamórfico: gerar a MESMA curva de preços e fornecer (a) 1 tick/s e (b) quatro ticks/s idênticos por segundo.

- O Price Action **altera a previsão original**, embora a trajetória matemática seja idêntica. O erro foi reproduzido em teste automatizado.
- Um arquivo temporal local usa landmarks de 1s / 2s / 5s / 30s para preservar eventos a diferentes distâncias temporais.
- Comparados os históricos normalizados, os nove motores podem obter **exatamente o mesmo resultado** com as duas fontes 1Hz e 4Hz para os seis horizontes 5/10/30/60/120/300s, porque recebem a mesma série histórica filtrada.
- O arquivo não interpola preços, não retrodata ticks, mantém carimbos reais, não lê futuro e limita-se a até 4096 linhas.
- Importante: a normalização altera os dados de entrada. Isto é **invariância técnica**, não comprovação de melhoria de CALL/PUT. A comparação direcional com cotações reais externas ou do broker é obrigatória antes de integrar.

## O que os pesquisadores e ferramentas externas realmente oferecem

- **Markov switching e mudança de regime:** statsmodels `MarkovRegression` modela média/variância dependentes de um estado latente. É referência para estimar mudança de regime probabilística, não prova de que identificaremos antecipadamente TODAS as reversões. [Statsmodels](https://www.statsmodels.org/stable/examples/notebooks/generated/markov_regression.html).
- **Validação com purging + embargo:** resultados futuros overlapping provocam vazamento estatístico; treinos que atravessam o período de teste devem ser retirados e o backtest temporal deve seguir estritamente a sequência de emissão. [Purged CV](https://python.financial/concepts/purged-cross-validation/).
- **Fluxo real de ordens tem conteúdo preditivo:** o Bank for International Settlements encontrou informação de preço nos fluxos de ordens do mercado cambial. O Sentinel atual dispõe basicamente de prints de preço lidos da corretora, e **não deve inventar volume, agressão ou order flow que não está disponível**. [BIS WP405](https://www.bis.org/publications/working-paper-405-information-flows-foreign-exchange-markets-dissecting-customer-currency-trades).
- **Não estacionariedade:** reversões, quebras estruturais e mudanças de volatilidade tornam parâmetros fixos frágeis. Avaliar por mercado, ativo, regime, dia, janela e custo é necessário. [Survey](https://www.sciencedirect.com/science/article/pii/S092523122602045X).
- **Séries cambiais são difíceis de prever fora da amostra:** Meese/Rogoff demonstraram as limitações de modelos estruturais nos horizontes estudados (mensais; **não extrapolar como resultado específico para 5-300 segundos**). [Estudo](https://www.nber.org/books-and-chapters/exchange-rates-and-international-macroeconomics/out-sample-failure-empirical-exchange-rate-models-sampling-error-or-misspecification).

## Próximas mudanças justificadas, na ordem certa

1. Corrigir primeiro a **semântica temporal** de histórico e indicadores, com orçamento de CPU/RAM controlado e fidelidade de timestamps.
2. Medir os resultados binários `T+H->T+2H` usando a cotação registrada no instante da emissão e nas duas datas-alvo, sem prolongar prazo automaticamente.
3. Preservar os nove motores selecionáveis, mas acrescentar validação da capacidade de histórico e regime com modelos estatísticos fundamentados e desempenho comprovado; sem votação mágica.
4. Testar contra dados reais da própria corretora (DEMO), em ativos/dias não usados no treinamento, com um resultado por intervalo independente; reportar acertos, falsos sinais, payout e incerteza estatística.
5. **Só então** incorporar mudanças que consistentemente superem a 67, com rollback imediato. Não promover combinações que apenas ficaram melhores em simulações artificiais.

## Arquivos e status

- `src/core/vnext-temporal-evidence-research.mjs`: protótipo de normalização e memória temporal, independente.
- `tests/sentinel-v13467-temporal-integrity.test.mjs`: regressão e invariância com 9 motores/6 horizontes.
- `.github/workflows/sentinel-temporal-integrity-lab.yml`: testes automatizados em repositório.
- PR de pesquisa separada; **sem build/deploy operacional**.

**Decisão responsável:** ainda não é tecnicamente honesto prometer 75–80% em todos os movimentos ou 100% em reversões e oscilações; esta pesquisa demonstra um defeito real da engenharia que deve ser corrigido antes de estimar um ganho de assertividade.
