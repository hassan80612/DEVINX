# Sentinel — correção preparada 13.9.23

O vídeo confirma o problema de direção em mudanças do gráfico. O valor das ordens e o Martingale não foram usados como explicação nem como entrada do teste.

## O que foi corrigido

O modelo de 30s podia escolher os 12 exemplos históricos mais próximos mesmo quando nenhum era semelhante ao movimento atual. Além disso, comparava apenas movimentos de até 32s, perdendo o contexto da onda anterior.

A correção acrescenta o contexto observado de 60s e verifica a semelhança da trajetória curta dos exemplos selecionados. Quando não existe exemplo comparável, volta à avaliação estrutural que já existe. Não cria cooldown, reinício de histórico por ciclo ou segunda confirmação temporizada. Uma cotação vencida também não pode autorizar uma recomendação pelo aprendizado histórico.

## Evidência do vídeo

Fonte: `1001267096.mp4`, 9min14,8s. Foram extraídas 542 observações do preço mostrado no card, uma por segundo quando legível. A região ficou fora de vista por 13 segundos; esses preços não foram inventados.

| Horário mostrado | Base anterior | Correção | Movimento observado em 30s |
| --- | --- | --- | --- |
| 13:53:20 | PUT | PUT | Favorável ao PUT |
| 13:54:52 | PUT | PUT | Favorável ao PUT |
| 13:55:53 | PUT | Sem entrada por analogia incompatível | Alta, desfavorável ao PUT |
| 13:57:29 | CALL | Sem entrada por analogia incompatível | Queda, desfavorável ao CALL |

Cada modelo também percorreu a sequência inteira, em ordem, com seus próprios ciclos de 30s. Os preços futuros só foram usados depois para avaliar o resultado.

| Replay completo | Base anterior | Correção |
| --- | ---: | ---: |
| Sinais | 14 | 14 |
| Favoráveis | 5 | 7 |
| Desfavoráveis | 6 | 6 |
| Empates no preço arredondado | 3 | 0 |
| Sem observação suficiente no vencimento | 0 | 1 |
| Maior sequência de perdas | 4 | 2 |

São ciclos diferentes: o total de perdas não caiu no replay completo. O sinal sem desfecho suficiente foi excluído dos favoráveis e desfavoráveis.

Excluindo os primeiros 180s para completar o contexto disponível, a comparação foi 3 favoráveis/5 desfavoráveis/3 empates contra 5 favoráveis/5 desfavoráveis/1 sem desfecho. Simulando entrada um segundo depois, foi 3/6/2 contra 4/6/0, além de um sinal sem desfecho na candidata; com dois segundos, 3/7/1 contra 4/6/0, também com um sem desfecho. A melhoria é menor quando a entrada atrasa.

## Verificação além do vídeo

Dois conjuntos de 56 caminhos gerados foram usados para diagnóstico. O segundo usou novas sementes após finalizar a regra; não são operações de mercado.

| Grupo no segundo conjunto gerado | Base: favoráveis/desfavoráveis | Correção: favoráveis/desfavoráveis |
| --- | ---: | ---: |
| Alta | 134/2 | 134/2 |
| Baixa | 136/0 | 135/1 |
| Virada de alta para baixa | 119/17 | 120/10 |
| Virada de baixa para alta | 119/17 | 122/8 |
| Oscilação | 116/18 | 127/6 |
| Oscilação irregular | 124/12 | 124/12 |
| Passeio aleatório | 62/67 | 58/69 |

Há regressão em baixa e passeio aleatório. A alteração não resolve todos os regimes. Uma tentativa anterior que exigia confirmação curta em todas as recomendações foi descartada porque piorou a comparação completa, apesar de evitar os dois erros destacados.

## Testes e pacote

- 210 testes aprovados, zero falhas, incluindo os testes obrigatórios de publicação e os novos casos do vídeo.
- O fluxo real `_signalValidationGate` emitiu exatamente as entradas do replay da candidata.
- Testados causalidade, dados futuros, simetria de alta/baixa, mudança de escala, estratégias visíveis e uma chamada por vencimento.
- Modos de 5s, 10s, 15s e 60s preservados na comparação com a base.
- Instalador Windows 13.9.23 compilado; ZIP embutido e código corrigido conferidos byte a byte. O executável não foi executado no Windows nesta sessão.
- Base de produção examinada: `bd75d03412ab12ebffbabcfefd226eeb91f5ae0f`. Não houve publicação em produção.

## Limite prático

Os preços visíveis têm cinco casas decimais, os horários foram aproximados ao segundo do vídeo e faltam os ticks originais e o histórico anterior ao início da gravação. O replay reproduz dois erros específicos e demonstra melhora nessa reconstrução; não reproduz todas as decisões originais e não comprova uma taxa de acerto futura. Empates por arredondamento não comprovam empate na corretora. A consistência geral ainda não pode ser declarada resolvida.

Reprodução a partir da amostra auditável:

```bash
node scripts/sentinel-video-consistency-compare.mjs
node scripts/sentinel-video-consistency-holdout.mjs
node scripts/sentinel-video-consistency-holdout.mjs --validation-set
node --test tests/sentinel-video-consistency-20261016.test.mjs
```
