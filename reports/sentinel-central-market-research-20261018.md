# Núcleo central e pesquisa de estratégias — 18/10/2026

**Foi implementada uma mudança concreta na arquitetura da decisão, com controle que preserva o comportamento existente. Não houve melhora comprovada de assertividade e nenhuma versão nova foi publicada.**

Base: Sentinel 13.9.37, commit `21f43a9587e2a4f6cdb23933226b4b0f0520e466`.

## Implementação

- Um resolvedor central recebe projeção, reação histórica, observação das velas e sequência de rompimento/reteste. A escolha do resultado final acontece em um módulo explícito.
- Níveis históricos continuam sendo calculados pelo motor existente. Uma mudança de estrutura confirmada tem precedência sobre um indicador que ainda descreva a tendência anterior.
- ADX e +DI/-DI foram implementados sobre até 100 velas realmente recebidas e fechadas, com suavização de Wilder, separação de períodos e reinício após lacunas. Nenhum novo temporizador ou coleta de histórico foi acrescentado.
- O candidato considerou uma rejeição contra uma tendência forte e não decrescente insuficiente para inverter a direção sem mudança estrutural confirmada. O primeiro ADX válido pode usar a força sem uma comparação anterior; as medições seguintes exigem ADX não decrescente. Contexto fraco, em transição ou desconhecido preserva a leitura anterior.
- O ciclo existente continua mantendo um único lado e vencimento durante os 30 segundos. A nova lógica não envia operações.

O resolvedor é utilizável na cópia isolada por `centralMarketResearchRuntime({regimePolicy:false})`. O controle desliga somente a hipótese de regime e mantém a organização central. Nenhum desses módulos foi inserido no instalador publicado.

## Resultado completo

| Variante | Acertos | Erros | Empates | Acerto sobre resultados não empatados |
|---|---:|---:|---:|---:|
| 13.9.37 publicada | 306 | 318 | 19 | 49,04% |
| Núcleo central, controle sem regra nova | 306 | 318 | 19 | 49,04% |
| Núcleo central + regra de tendência/rejeição | 299 | 314 | 18 | 48,78% |

São 15 janelas externas já conhecidas. O controle reproduziu exatamente todas as entradas, preços, lados, vencimentos e resultados da base. A regra nova melhorou 3 janelas, piorou 3 e deixou 9 iguais. Por isso não foi considerada melhoria nem foi ativada no agente.

O vídeo extraído conhecido ficou exatamente em 11 acertos, 3 erros e um vencimento sem preço em todas as variantes. Como não contém o histórico OHLC verificado, isso não valida o ADX nesse trecho. No conjunto externo não houve vencimento sem preço.

A mediana das medianas de avaliação foi aproximadamente 0,509 ms na base e 0,525 ms na candidata nesta máquina. O maior p95 entre as janelas foi aproximadamente 7,74 ms e 7,77 ms, respectivamente. São tempos locais do replay, não medição de latência na corretora. Algumas entradas seguintes ficaram mais distantes porque a regra se absteve; não confundir ausência de temporizador com garantia de sinais frequentes.

## Pesquisa aplicada

1. [CME: confirmação de reversões](https://www.cmegroup.com/education/courses/technical-analysis/technical-patterns-reversals). A explicação de padrões de topo/fundo exige confirmação da estrutura. Adaptei o princípio ao rompimento/reteste já observado no motor, sem afirmar que esses padrões comprovem direção em 30 segundos.
2. [CME: suporte e resistência](https://www.cmegroup.com/education/courses/technical-analysis/support-and-resistance). Níveis anteriores e médias ajudam a localizar áreas de reação; não são barreiras garantidas.
3. [Fidelity: DMI](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/DMI). ADX trata de força e +DI/-DI de direção. Os limiares usuais de 25/20 foram fixados antes do teste, sem otimização posterior nos resultados.
4. [Freqtrade: exemplo oficial de estratégia](https://github.com/freqtrade/freqtrade/blob/develop/freqtrade/templates/sample_strategy.py). O exemplo usa ADX entre seus indicadores, mas isso não o torna infalível nem transferível automaticamente de 5 minutos para 30 segundos. Não copiei retornos anunciados como prova de desempenho.
5. [Freqtrade: validação](https://www.freqtrade.io/en/stable/strategy-101/). A documentação distingue resultados históricos de funcionamento real. O replay utilizado só entrega ao motor dados recebidos até aquele instante; o avaliador separado consulta o preço de vencimento depois da decisão.
6. [TA-Lib: ADX](https://github.com/TA-Lib/ta-lib/blob/main/src/ta_func/ta_ADX.c). A inicialização da suavização foi conferida e ajustada antes do resultado final. O cálculo foi verificado também por um caso numérico manual de quatro barras. Os relatórios preliminares anteriores ao alinhamento foram preservados e não substituem o relatório final.

## Testes e limites

Nove testes passaram: separação de força e direção, simetria CALL/PUT, ausência de tendência inventada em dados constantes, referência numérica, exclusão de velas futuras/não recebidas/em formação, resolução de períodos, lacunas, preservação de leituras quando o contexto não é forte, prioridade de mudança estrutural real imutabilidade do sinal emitido e preservação dos demais horizontes de análise.

O primeiro ensaio de um teste exigiu completar o fixture de níveis com os metadados de testes de velas usados pelo leitor real; a regra não foi modificada por isso. Nenhum parâmetro foi reajustado depois da regressão final. Não foram avaliados os blocos listados como reservados herdados do roteiro anterior: já eram conhecidos de outra experiência e não seriam validação inédita.

Reprodução: `node --test tests/sentinel-central-market-research-20261018.test.mjs`; `SENTINEL_CENTRAL_SET=known node scripts/sentinel-central-market-ab-20261018.mjs`. Relatórios brutos completos estão em `.json.gz`; descompactar se necessário. O script usa as fixtures já preservadas no projeto.

A implementação nova é concreta e revisável. O ganho de acertos continua sem demonstração; esta combinação de ADX com rejeição foi reprovada no agregado. Dados Forex históricos externos não estabelecem assertividade do OTC do usuário, e não foi testada uma sessão nativa autenticada nem uma estratégia infalível.
