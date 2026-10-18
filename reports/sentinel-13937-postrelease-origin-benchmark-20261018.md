# Investigação retomada após publicar a 13.9.37

Diagnóstico sem nova alteração no motor publicado. O replay usa diretamente os módulos da versão 13.9.37; todas as listas de entradas coincidiram exatamente com a variante corrigida que havia sido testada. Uma segunda instância idêntica também produziu os mesmos sinais. Nenhuma regra de decisão foi ajustada pelos resultados abaixo.

## Origem das decisões

Em 15 trechos externos já conhecidos, o motor produziu 306 acertos/318 erros, ou 49,04%, excluindo 19 empates. São 14 trechos de 30/03/2020 e um trecho de outro dia, 31/03/2020, de EUR/USD Forex externo. Não são operações ou cotações OTC da conta do usuário.

| Origem final do sinal | Acertos | Erros | Percentual |
|---|---:|---:|---:|
| Rejeição histórica de nível | 110 | 101 | 52,13% |
| Rejeição pelas velas em várias escalas | 69 | 82 | 45,70% |
| Comparação com padrões locais anteriores | 34 | 43 | 44,16% |
| Estrutura fechada e impulso atual | 21 | 20 | 51,22% |
| Rompimento e reteste | 22 | 15 | 59,46% |
| Falso rompimento com mudança de estrutura | 22 | 20 | 52,38% |
| Rompimento histórico direto | 15 | 16 | 48,39% |
| Virada nos extremos de oscilação | 11 | 15 | 42,31% |

As rotas restantes somam poucos resultados e estão no JSON, sem atribuir significado a percentuais extremos de um ou dois casos. As diferenças por origem são retrospectivas; filtrar uma rota muda os horários das próximas entradas. Esses percentuais não demonstram que desativá-la elevaria a assertividade do sistema completo.

Nesta amostra, padrões locais e rejeições pelas velas são dois focos concretos de fragilidade com volume razoável. Entretanto, o comportamento varia entre dias: por exemplo, os padrões ficaram em 31/73 no dia conhecido e 3/4 no trecho novo. Quatro casos novos são insuficientes para validar uma solução ou uma inversão dessa leitura.

O código de padrões seleciona exemplos a cada quatro segundos, embora cada resultado tenha horizonte de 30 segundos. Horizontes adjacentes se sobrepõem nominalmente por 26 segundos. A força da votação mede concordância desses exemplos correlacionados, não uma probabilidade validada de acerto. Corrigir a direção da votação na 13.9.37 não corrige essa limitação de evidência.

## Comparação com leituras simples

Cada comparação abaixo usa exatamente o mesmo subconjunto de entradas para o motor e a leitura simples. Referências históricas precisam existir até o instante da entrada e estar a no máximo 2,5 segundos do horário requerido. Movimento zero ou referência ausente é informado como indisponível, sem fabricar uma direção.

| Leitura simples | Resultados comparáveis sem empates | Motor nos mesmos pontos | Leitura simples |
|---|---:|---:|---:|
| Direção da última variação observada | 385 | 49,87% | 52,73% |
| Movimento dos cinco segundos anteriores | 552 | 47,83% | 49,82% |
| Movimento dos vinte segundos anteriores | 565 | 48,67% | 49,73% |

Essas comparações não fornecem uma estratégia substituta validada. Elas mostram que, nestes dados já examinados, a complexidade do motor não trouxe vantagem demonstrada sobre referências simples. São cotações históricas, sem clique, pagamento da operação ou transporte real modelados.

O vídeo antigo foi avaliado separadamente no JSON, sem somá-lo ao Forex. A extração mais precisa mantém 11 acertos/3 erros e uma saída ausente; suas limitações de cotação e ausência de velas históricas verificadas permanecem.

Não foi aplicada uma nova trava, inversão, temporizador ou estratégia à versão publicada. Esta investigação localiza rotas para aprofundamento, sem afirmar que a assertividade já foi resolvida.

Reprodução: executar `node scripts/sentinel-13937-postrelease-origin-benchmark-20261018.mjs` com os fixtures externos preparados e os relatórios de comparação preservados no checkpoint de pesquisa `17d945ce53458a0130b2dec1277f0f8a500036ab`. Esse checkpoint fornece os dados de referência e a proveniência; o código de produção auditado é o commit `21f43a9587e2a4f6cdb23933226b4b0f0520e466`.
