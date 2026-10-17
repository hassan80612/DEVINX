# Aplicação da pesquisa: eventos de nível e estrutura local — 17/10/2026

**Estado:** implementação e testes concluídos na cópia de pesquisa. Não publicada. O produto permanece na 13.9.32.

## O que mudou

O motor agora distingue uma sequência de eventos, em vez de tratar cada toque isoladamente: rompimento, recuperação do nível, formação de fundo mais alto/topo mais baixo e quebra do pequeno pivô local; ou rompimento, reteste pelo lado oposto e continuação. O sentido já emitido permanece imutável até o vencimento.

Foi identificada e corrigida, na cópia de pesquisa, uma classificação inadequada: máximas e mínimas coincidentes de velas podiam ser contadas como barreiras mesmo quando o preço apenas as atravessava. Os extremos continuam no mapa, mas só entram como barreiras confirmadas se houver pivô confirmado ou rejeições independentes observadas. As rejeições exigem aproximação e reação em velas fechadas consecutivas; lacunas não podem fabricar a reação.

A avaliação também identifica movimento direcional após rejeição histórica confirmada e estima se o próximo nível está além do deslocamento de 30 segundos calculado pela velocidade observada. Essa estimativa serve como hipótese de continuação, sem substituir um nível desconhecido por caminho livre. Não é uma previsão garantida nem uma leitura de ordens.

Não há novo cronômetro, espera fixa, consulta à corretora ou coleta obrigatória de 100 velas novas. Permanecem as janelas de 3, 10, 20, 50 e 100 velas efetivamente recebidas e os mesmos prazos de validade das entradas.

## Comparação sintética com a produção 13.9.32

Cada trajetória tem 12 minutos avaliados e histórico OHLC anterior coerente com os preços gerados. Só entram velas fechadas e cotações disponíveis no instante de cada decisão. O vencimento começa na emissão. Todos os resultados desta seção são **artificiais, não taxas comprovadas no mercado**.

| Trajetória artificial | Produção: acertos / erros | Candidato: acertos / erros |
|---|---:|---:|
| Alta | 23 / 1 | 23 / 1 |
| Baixa | 24 / 0 | 24 / 0 |
| Oscilação regular | 20 / 0 | 20 / 1 |
| Oscilação variável | 16 / 6 | 19 / 4 |
| Viradas bruscas | 7 / 15 | 20 / 2 |
| Caminhada aleatória, semente fixa | 9 / 13 | 11 / 12 |

No caso de viradas bruscas, houve 14 entradas nos mesmos instantes. Nesse subconjunto, a produção acertou 7 e o candidato acertou 14; 7 direções foram alteradas. As demais entradas mudaram de instante, portanto não representam uma comparação isolada apenas de direção.

O resultado de 20 acertos e 2 erros nesse cenário é promissor para a hipótese, mas não significa 90% de assertividade real. A trajetória tem movimentos triangulares previsíveis, com ciclo de aproximadamente 270 segundos e pontos de virada conhecidos pelo gerador, não pelo modelo. Ela não representa toda a variedade do OTC.

Existe uma regressão: na oscilação regular apareceu um erro adicional e uma operação adicional. A correção não eliminou todos os erros. Não é correto anunciar melhora universal ou somar cenários artificiais como se fossem uma amostra independente de mercado.

## Controle com oscilações mais rápidas

| Ciclo triangular artificial | Produção: acertos / erros / empates | Candidato: acertos / erros / empates |
|---|---:|---:|
| 20 segundos | 24 / 0 / 0 | 24 / 0 / 0 |
| 60 segundos | 0 / 0 / 24 | 0 / 0 / 24 |
| 90 segundos | 24 / 0 / 0 | 24 / 0 / 0 |

O controle de 60 segundos coincidiu com fases em que a cotação de entrada e a de vencimento foram iguais: os 24 empates não informam a capacidade de acertar direção. Os outros dois controles preservaram os resultados, mas continuam sendo ondas determinísticas; não demonstram generalização para o mercado.

## Vídeo e latência

O replay pelo caminho real do runtime mantém exatamente os mesmos instantes, preços e direções da 13.9.32 nas duas extrações do vídeo: 10 acertos e 4 erros na extração de seis casas; 10 acertos e 3 erros na de cinco casas; um vencimento ausente em cada. São duas leituras da mesma gravação, não sessões independentes. Não existem nela as 100 velas anteriores recebidas pelo Agent, portanto esse replay não exercita a nova parte histórica. Nenhuma vela anterior foi inventada para obter resultado melhor.

Na comparação principal, o candidato levou aproximadamente 4,2 a 6,1 milissegundos por avaliação, em média por trajetória; o percentil 95 ficou entre aproximadamente 7,2 e 8,3 milissegundos. Medição nesta máquina, sem garantia de desempenho no PC do usuário. Não foi adicionada espera em segundos.

## Verificação

As baterias de regressão existentes passaram: 27 + 20 + 139 + 39 testes. A pesquisa contém 15 testes de mapa de velas e 13 de sequência observada. O teste adicional de lacuna entre velas e os testes das rotas afetadas também passaram após a última alteração. Foram verificados rompimento e reteste, recuperação sem quebra de estrutura, invalidação da recuperação, simetria CALL/PUT, dados futuros, lacunas, frescor, prazo integral e impossibilidade de alterar um sinal em andamento. Os testes não enviam ordens.

## Base da pesquisa e limites

- [CME: reversões e formação de topos/fundos](https://www.cmegroup.com/education/courses/technical-analysis/technical-patterns-reversals).
- [CME: suporte, resistência e mudança de função dos níveis](https://www.cmegroup.com/education/courses/technical-analysis/support-and-resistance).
- [Fidelity: rompimentos falsos e fracassados](https://www.fidelity.com/bin-public/060_www_fidelity_com/documents/learning-center/Idenitfying-Chart-Patterns.pdf).
- [New York Fed: ordens, reversões e aceleração após rompimentos](https://www.newyorkfed.org/research/staff_reports/sr125.html).

A implementação é uma hipótese computacional inspirada nessas fontes, não uma reprodução validada de seus resultados. A estimativa de caminho livre por velocidade é uma inferência de engenharia a testar, não uma fórmula de acerto publicada por essas instituições.

**Conclusão:** houve avanço demonstrado em um cenário artificial de viradas bruscas e correção de uma classificação defeituosa de barreiras. Ainda há erros e uma regressão em outro cenário. Não há comprovação de ganho real de 84–90%; por isso o novo motor não foi publicado como se essa meta tivesse sido atingida.

## Reprodução

```sh
node --test tests/sentinel-observed-level-sequence.test.mjs tests/sentinel-multiscale-level-chain.test.mjs
node scripts/sentinel-multiscale-compare.mjs /caminho/absoluto/da/versao32/agent/src/core sentinel-observed-sequence-synthetic-20261017.json observed-level-sequence-defended-levels
node scripts/sentinel-observed-sequence-video.mjs /caminho/absoluto/da/versao32/agent/src/core
```
