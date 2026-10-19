# Sentinel 13.9.54 — perícia da decisão CALL/PUT (somente pesquisa)

Base: produção 13.9.54, commit `c17388ada742a24daa5f3e7fc67c6b46bbdd39b4`. Não modifica executável, bot, corretora ou site. Correções não analíticas preservadas em `backup/sentinel-13955-nonanalyst-fixes-only-20261019` (`a655331d5a7b9c3b91af3ca15ac6df084b45629d`).

## Achados no código operacional

1. O modo automático calcula contexto de estrutura (4 velas fechadas e confirmação de movimento recente) e eventualmente padrões análogos concluídos. No ramo `adaptive-market-v17`, uma projeção harmônica de 30 segundos (até 180 segundos de observações prévias) **substitui incondicionalmente o lado estrutural/analógico quando ambos estão 'ready'**: `baseline=forecast?.ready&&original.ready?{...original,...forecast}:original`, `now-opportunity-engine.mjs` linhas ~169–182. A projeção é depois submetida a reações históricas e seleção entre *duas projeções* estreita/ampla.
2. A projeção utiliza o sinal de `expectedLogMove` para gerar CALL/PUT, aceitando qualquer módulo maior que `1e-12` como previsão pronta; não exige que esse movimento supere o ruído recente nem que o ajuste tenha poder preditivo demonstrado. Vide `thirty-second-expiry-direction.mjs` linhas ~61–66.
3. O seletor `CompletedExpiryDirection` compara resultados anteriores da projeção de ciclo estreita e ampla, **não compara sistematicamente os resultados da tendência/estrutura contra a projeção**. Isso pode favorecer um extrapolador inadequado para uma mudança de regime. Não é evidência de que toda previsão de ciclo seja pior.
4. Uma entrada de estrutura também usa 3 das 4 velas fechadas alinhadas e movimento atual no sentido delas; isso explica o peso do movimento recente nas decisões de continuação quando o mercado já está perto de retrair. Não é verdade que o programa utilize exclusivamente a última vela.
5. Outros filtros de reação histórica podem aceitar, bloquear ou alterar a decisão. O replay abaixo mede a decisão **final**, sem substituir essas camadas.

## Reprodução causal por vídeo — **não** é a sessão de perdas atual

Fonte única `1001267096.mp4`, vídeo antigo EUR/GBP OTC. Foram usadas **duas extrações do mesmo vídeo**, uma 2Hz/6 casas (1065 cotações) e outra 1Hz/5 casas, não duas amostras independentes. Para cada quote o replay passa somente histórico já recebido; depois de emitir o sinal, usa um preço observado até 1 segundo após +30s apenas para marcar acerto/erro. Não há ordem real nem dados futuros no cálculo do sinal.

| Reconstrução | Sinais | Acertos confirmáveis | Erros | Vencimento desconhecido | Acertividade | Inversão em mesmos instantes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2Hz / 6 casas | 15 | 11 | 3 | 1 | 78,6% | 3 acertos / 11 erros |
| 1Hz / 5 casas | 14 | 10 | 3 | 1 | 76,9% | 3 acertos / 10 erros |

**2Hz:** 13/15 sinais tinham razão decisória de projeção/seleção do ciclo, um da estrutura e um de seleção bootstrap; os cálculos de camada mostram discordância entre analógico e ciclo em 5 instantes. Em **dois dos três erros observáveis**, o ciclo escolhido foi oposto à analogia estrutural: (a) `1792169513500`, analogia PUT, ciclo e final CALL, preço futuro favoreceu PUT; (b) `1792169804500`, analogia CALL, ciclo e final PUT, preço futuro favoreceu CALL. Existe também um erro em que ambos concordavam, então impedir sempre a substituição **não resolveria tudo**.

## Comparação descritiva por estado de mercado, sem ajustes de limiar

Com 2Hz, classificando por concordância do deslocamento observado nos últimos 5, 15, 30 e 60 segundos (somente informação anterior ao sinal):
- **Quatro deslocamentos alinhados:** 4 acertos / 2 erros / 1 desconhecido.
- **Deslocamento curto contrário à onda longa:** 0 acertos / 1 erro.
- **Direções mistas ou viradas:** 4 acertos / 0 erros.
- **Histórico incompleto:** 3 acertos / 0 erros.

Na leitura 1Hz, quatro deslocamentos alinhados: 4/2; curtos contrários à onda longa: 1/1/1 desconhecido; mistos/viradas: 4/0. Esses resultados **não comprovam** que o regime misto seja mais fácil: o vídeo é curto e os horários dos sinais mudam entre as leituras. Não usar esses contadores para ajustar thresholds nem anunciar um motor melhor. A atual observação do usuário ("funciona só com tendência contínua") pode descrever outro momento do mercado; **não existe histórico completo da sessão atual nesta pesquisa**.

## Conclusão técnica

O defeito conceitual a examinar primeiro é a **autoridade não calibrada** de um sinal harmônico/extrapolado sobre uma leitura de estrutura que pode ser contraditória, especialmente em mudanças de ritmo e retrações. A alteração mecânica da direção de todos os sinais se mostrou pior no replay antigo e não representa uma solução validada para a sessão atual. A observação da última vela é só uma das entradas; há tanto erros de continuação quanto de inversão.

### Próxima validação obrigatória antes de mudar o motor

- Usar cotações de IQ Option/Exnova da **mesma sessão** em que ocorreram os erros e seus horários de sinal (incluindo sinais perdedores que o Martingale mascarou). Nenhuma taxa atual deve ser presumida sem essas cotações.
- Comparar nos mesmos instantes: lado estrutural, analogia causal, projeção estreita, projeção ampla, decisão final, fase/volatilidade observadas **antes** da emissão e fechamento observado 30s depois.
- Projetar alternativas causais em modo sombra, mantendo os horários e amostras de teste separados da concepção dos critérios. Comparar cobertura de sinais, taxa de acerto por regime, piores sequências e períodos/ativos não usados nos ajustes.
- **Não publicar** nenhuma alteração do motor com base apenas nesta gravação, nem fazer backfit disfarçado de prova.

Reprodução da perícia, leitura apenas: `node scripts/sentinel-13954-direction-attribution-20261019.mjs`. Testes e workflow: `.github/workflows/sentinel-13954-direction-attribution-research.yml`.

## Auditoria nova: construção do histórico e efeito da vela corrente

Comparação pura das funções publicadas da 13.9.54, com preços sintéticos controlados; NÃO é medição da sessão do usuário. Reproduzível por `node scripts/sentinel-13954-candle-historical-calculation-audit.mjs`.

1. **Série histórica mais longa prevalece sobre a mais atual** (`historical-price-structure.mjs`, `closedCandles`): o código agrupa os candles por duração, ordena pelos grupos com maior QUANTIDADE, e só usa recência para desempatar. Ao combinar 40 barras antigas de 60s com 12 barras recentes de 5s, devolveu o período de **60 segundos** encerrado **1.200.000ms (20min) antes** do presente, apesar das 12 barras de 5s terminarem exatamente no tempo atual. O defeito de seleção é real; resta verificar se o feed operativo chega misturado desse jeito.
2. **Pivô histórico marcado sem os dois lados fechados**: `historical-price-structure.mjs` define `pivot` se houver pelo menos dois vizinhos, permitindo que na última barra todos os vizinhos sejam ANTERIORES. No experimento, a máxima da última barra foi contada em `zone.pivots=1` sem barra futura, mas `candle-level-map.mjs` a identificou corretamente como `confirmedPivots=0`. **Logo, não afirmar que esse pivô isolado liberou uma ordem: a segunda camada o descarta nesse caso**, embora persista a contagem inconsistente e a possibilidade de afetar pesos de outras zonas já confirmadas.
3. **Vela de 1 segundo ainda aberta influencia estratégia manual de tendência** (`now-strategy-evidence.mjs`, `barsOf`): agrega todas as cotações observadas por segundo, incluindo a única cotação inicial da vela corrente; conta essa vela entre as últimas quatro barras para confirmação. Uma sequência controlada foi `{ready:false,side:null,reason:'current-flow-unconfirmed'}` antes da primeira cotação de um novo segundo e `{ready:true,side:'CALL',reason:'current-trend-follow-through'}` logo após **um único tick** da vela ainda em formação. Isso é compatível com o relato de reação excessiva ao movimento mais recente; não prova que tal tick realmente errou um CALL na sessão. O motor automático tem ramo separado com quatro barras fechadas de 10s para operações de 30s, mas também usa analogias e projeção de 30s.

### Correções técnicas a avaliar (isoladas, sem produção)

- A seleção de histórico precisa ser explícita quanto ao período relevante à estratégia e **rejeitar as séries antigas ou interrompidas**; nunca substituir o gráfico atual só porque outra coleção contém mais barras.
- A classificação `pivot` deve exigir **velas fechadas de ambos os lados** e pesos históricos não devem contar extremos não confirmados.
- Separar `última vela fechada` de `vela atual em formação` na confirmação, sem eliminar a cotação viva necessária à decisão; tratar o movimento instantâneo como observação, não por si só confirmação de tendência ou resultado futuro de 30s.
- Comparar previsão de 30s com estrutura e resultados concluídos usando o mesmo vencimento e **outros ativos/instantes que não foram usados para criar o critério**. Nenhuma dessas correções, sozinha, comprova aumento da assertividade.

### Teste executado

GitHub Actions workflow de pesquisa concluído sem falhas em 19/10/2026. Apenas scripts e relatório em ramo de investigação. Nenhuma publicação nem inversão.
