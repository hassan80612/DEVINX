# Conflito na decisão final — auditoria da 13.9.43

**O conflito existe, mas impedir somente sua reabertura não melhorou os resultados. A fragilidade de assertividade persiste também fora desse caminho. Não foi feita publicação nem alteração no bot ou no analista em produção.**

Base auditada: commit `32ba17004713a085ac8f0e16adc28da739896634` (13.9.43). Os 75 arquivos do núcleo do analista permanecem idênticos à base 13.9.42. O bot não participa deste replay: só a decisão do analista e o preço observado no vencimento são avaliados.

## O conflito reproduzido

O fluxo real passa por previsão de 30 segundos, seletor de projeções, reação histórica, rejeição de velas e sequência de rompimento/reteste. `applyHistoricalPriceStructure` pode retornar `ready:false`, `side:null` e `historical-level-versus-expiry-conflict`. Depois, `applyCandleLevelRoute` ou `applyObservedLevelSequence` ainda pode retornar `ready:true` e liberar CALL/PUT. A razão final substitui a anterior, de modo que olhar somente a mensagem final esconde essa rejeição intermediária.

Foram reproduzidos CALL e PUT nas funções reais, com candles e cotações controlados. A hipótese isolada mantém terminal apenas a rejeição explícita por conflito histórico, sem forçar concordância geral com projeções, sem indicador adicional e sem temporizador. Cinco testes passaram, inclusive simetria, preservação de outros horizontes e imutabilidade de um sinal já emitido.

Isso é uma inconsistência de autoridade entre etapas; não prova que cada reação posterior esteja errada. Uma mudança de estrutura pode corrigir uma projeção ruim. Não é adequado simplesmente preferir sempre a primeira previsão.

## Resultado completo do teste

15 trechos conhecidos de EUR/USD externo, em 30 e 31/03/2020, foram reexecutados com o núcleo atual. São dados Dukascopy já usados em pesquisas anteriores, não validação inédita, cripto, OTC ou as cinco sessões relatadas pelo usuário. Os três trechos iniciais estão incluídos nesses 15; não devem ser somados novamente.

| Variante | Acertos | Erros | Empates | Acertos sem empates |
|---|---:|---:|---:|---:|
| Analista atual | 306 | 318 | 19 | 49,04% |
| Conflitos explícitos sem reabertura | 306 | 318 | 19 | 49,04% |

Não houve vencimento sem preço nos dados externos. A instrumentação sem regra nova reproduziu exatamente todas as entradas do núcleo publicado. Na candidata, duas entradas mudaram de instante em um trecho, sem ganho de acertos. Os outros 14 trechos conservaram o fluxo. Não se trata de simplesmente retirar retrospectivamente as operações perdedoras da lista original.

Houve 25 observações intermediárias com conflito reaberto, mas só uma virou uma nova entrada durante a janela em que o runtime permitia emitir sinal. Essa entrada foi vencedora. As outras ocorreram enquanto já havia sinal travado ou fora de uma nova emissão. Em cinco novas entradas a direção final contrariou a previsão disponível: as cinco venceram; seguir a previsão nesses mesmos cinco instantes teria perdido. É uma amostra muito pequena, que serve para refutar a conclusão automática de que toda divergência é um erro, não para provar que a prioridade atual é boa.

## Onde o desempenho foi fraco

| Origem final | Acertos | Erros | Acertos sem empates |
|---|---:|---:|---:|
| Rejeição de velas em várias escalas | 69 | 82 | 45,70% |
| Padrões locais anteriores | 34 | 43 | 44,16% |
| Rejeição histórica de nível | 110 | 101 | 52,13% |
| Rompimento e reteste | 22 | 15 | 59,46% |

Esses grupos são diagnósticos retrospectivos. O motor libera decisões sem uma evidência uniforme de desempenho do critério que tomou a decisão final. `CompletedExpiryDirection` atualiza perdas das opções `base` e `wide`, enquanto as reações históricas, rejeições de velas e sequências podem assumir a direção depois dessa escolha. Elas não são comparadas nesse mesmo aprendizado. Os resultados finais são contabilizados pelo runtime, mas essa contagem não seleciona a rota decisora.

Os padrões locais também usam exemplos separados por 4 segundos para resultados de 30 segundos, com sobreposição dos períodos; sua força de concordância não é uma probabilidade calibrada de vitória. Isso é uma limitação identificável no código, não prova de que trocar uma constante resolveria a previsão.

Desligar uma dessas rotas muda as próximas entradas; seu percentual isolado não valida uma substituição. Pesquisas anteriores com concordância obrigatória ou filtros de ADX já haviam falhado na validação. Esta auditoria não reaproveita esses candidatos rejeitados como solução.

## Conclusão prática e limites

A correção restrita de conflitos foi testada e não aprovada como melhoria de assertividade. A evidência disponível aponta fragilidade das próprias decisões, e não apenas um sinal correto sendo invertido por um conflito. O resultado atual desses dados é abaixo de metade de acertos; os testes de funcionamento do software não demonstram vantagem preditiva.

O relato de bancas de 10 e 20 chegando a zero é importante, mas não contém a sequência de entradas, ativos, horários, payout e liquidações necessária para calcular a taxa real dessas sessões ou atribuir cada perda a uma rota. A auditoria não transforma esse relato em uma medição inventada. Nenhuma operação financeira foi executada nesta sessão.

O diagnóstico e a hipótese permanecem em uma branch de pesquisa. Produção, mapeamento CALL/PUT, saldo e controles do bot continuam sem alteração.

## Reprodução e arquivos

- `node --test tests/sentinel-final-conflict-policy-20261018.test.mjs`
- `node scripts/sentinel-final-conflict-audit-20261018.mjs`
- `SENTINEL_FINAL_CONFLICT_SET=known node scripts/sentinel-final-conflict-audit-20261018.mjs`

O script usa as fixtures externas preservadas pelo preparo anterior. Se não estiverem presentes, executar os preparadores de ticks externos e oficiais já existentes; hashes de cada fixture estão no relatório. O replay fornece só cotações e candles recebidos/fechados até cada instante; o avaliador separado consulta o vencimento somente depois da decisão. Relatórios brutos comprimidos preservam todas as entradas, rastreamento de cada etapa e preços/prazos.

Arquivo bruto known: `sentinel-final-conflict-audit-20261018-known.json.gz`, SHA256 `7497a23c2c76b51665285dffcde24a993eec44379ead7f1944e9244b60ded14f`.
