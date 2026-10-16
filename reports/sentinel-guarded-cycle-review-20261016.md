# Sentinel — preservar o avanço e corrigir a onda antiga

## Resultado da rodada

A candidata anterior de 30s foi preservada: **10 favoráveis/4 desfavoráveis, 71,4%**, nos mesmos horários da publicada, contra 9/5, 64,3%, da 13.9.23. Nenhuma nova regra substituiu essa candidata ou a versão publicada. **Os acréscimos desta rodada não elevaram o resultado integral acima dos 71,4% e não atingiram 84%.**

Foram investigadas falhas de extrapolação de uma onda antiga após uma mudança do gráfico. Os acréscimos melhoraram alguns diagnósticos de virada, mas não produziram uma combinação consistentemente superior na gravação. Os resultados inferiores foram mantidos, sem selecionar apenas casos favoráveis.

## O que foi acrescentado

1. **Compatibilidade da trajetória atual:** o ajuste histórico projeta qual teria sido o movimento nos últimos 3s e 10s. Se os movimentos realmente observados nos dois intervalos são contrários aos ajustados, conserva-se a direção publicada, em vez da extrapolação da onda. A comparação é passado contra passado: não exige que o movimento atual aponte para a mesma direção prevista aos 30s.
2. **Desvio do preço atual:** se o preço atual se afasta do ajuste mais do que duas vezes seu resíduo quadrático médio, conserva-se a direção publicada. Trata-se de um limite geométrico de ajuste, não de probabilidade de acerto.
3. **Combinação das duas verificações**, mantendo todas as entradas nos mesmos instantes.
4. **Mudança de tendência dentro do próprio modelo:** a projeção passou a admitir um ponto observado de mudança de inclinação, além de uma oscilação. Os pontos possíveis foram espaçados em 30s, exigindo ao menos 30s observados antes e depois. Uma linha, uma linha com quebra, uma linha com ciclo e a melhor linha com quebra mais ciclo competem por erro penalizado. Os parâmetros não foram procurados para alcançar 84% no vídeo.

As verificações não bloqueiam ou removem sinais, não esperam outra vela e não criam cooldown. Elas escolhem entre a direção publicada e a candidata no mesmo instante já autorizado. O modelo com quebra também mantém essa autorização. A chamada emitida continua única e fixa durante a operação de 30s.

## Comparação integral do mesmo vídeo

| Modelo | Corretora: favoráveis / desfavoráveis | Taxa | Card: favoráveis / desfavoráveis | Taxa |
| --- | ---: | ---: | ---: | ---: |
| Publicada 13.9.23 | 9 / 5 | 64,3% | 7 / 6 | 53,8% |
| Avanço anterior, fase sem verificações | 10 / 4 | 71,4% | 10 / 3 | 76,9% |
| Compatibilidade de 3s e 10s | 10 / 4 | 71,4% | 7 / 6 | 53,8% |
| Desvio do ajuste | 9 / 5 | 64,3% | 8 / 5 | 61,5% |
| Duas verificações | 10 / 4 | 71,4% | 7 / 6 | 53,8% |
| Projeção com quebra de tendência | 6 / 8 | 42,9% | 7 / 6 | 53,8% |

Há um sinal final sem desfecho em todas as linhas de cada extração; ele não entra na taxa. Os horários são idênticos aos da publicada. As duas extrações são o mesmo vídeo, com precisão e frequência diferentes; não foram combinadas como sessões independentes.

Depois dos primeiros 180s, a candidata anterior e a verificação de trajetória tiveram 8 favoráveis/2 desfavoráveis, 80%, na extração mais precisa. Esse recorte não substitui a taxa integral nem comprova a meta em outra sessão.

## Onde as correções funcionaram e onde falharam

Em 35 caminhos gerados, de sete famílias e cinco sementes novas, a verificação de trajetória reduziu a falha de continuar a onda antiga nas viradas: no grupo subida seguida de queda, a candidata anterior teve 37 favoráveis/15 desfavoráveis, e a verificada 45/7. A publicada teve 46/6. Na virada contrária, passou de 36/16 para 45/7, ainda atrás da publicada, 47/5. Isso é diagnóstico de engenharia; os percentuais desses caminhos não são assertividade de mercado.

O modelo que admite quebra foi confrontado com outras três sementes, em 21 caminhos gerados. Melhorou as duas famílias de virada para 27/3, mas teve menos vantagem nas oscilações regulares. **No vídeo real reconstruído, caiu para 6/8.** Ajustar melhor uma mudança passada não garantiu uma direção melhor no vencimento seguinte.

Logo, o problema pendente não é somente acrescentar capacidade de representar a virada. É distinguir quando essa representação deve prevalecer sobre uma oscilação normal, sem trocar decisões corretas por erradas. A seleção por erro do desenho passado continua insuficiente para esse objetivo.

Os deslocamentos de origem do relógio de −1s a +1s também foram conservados. A verificação de trajetória variou entre 50% e 71,4%, herdando a mudança de horários de autorização da base. Não houve escolha de um relógio favorável para publicar.

## Preservação, testes e limites

- **33 testes passaram**, incluindo os anteriores e os novos: fidelidade das informações de diagnóstico, entrada nos mesmos instantes, duração sem sobreposição, ausência de influência de futuro ou chegada tardia e representação de uma quebra conhecida em caminho construído.
- Conferi que a candidata anterior mantém exatamente os mesmos horários, direções e resultados em ambas as extrações após acrescentar os diagnósticos opcionais.
- O código operacional do Agent, do site e o package.json permanecem iguais aos da versão publicada `a574f282`. Não houve nova publicação.
- A medição de cálculo no JSON exclui rede, navegador e Windows. O percentil 95 da verificação de trajetória ficou na ordem de 2ms no replay mais preciso; não equivale a medir a latência completa do usuário.
- O defeito de retenção de 2.400 observações em feeds densos continua documentado no relatório anterior. Não foi apresentado como corrigido nem como causa comprovada da sessão do usuário.

## Reproduzir

```bash
node research/guarded-cycle-study.mjs > reports/sentinel-guarded-cycle-video-20261016.json
node research/guarded-cycle-study.mjs --guards-diagnostics > reports/sentinel-guarded-cycle-diagnostic-20261016.json
node research/guarded-cycle-study.mjs --break-diagnostics > reports/sentinel-break-cycle-diagnostic-20261016.json
node research/guarded-cycle-study.mjs --clock > reports/sentinel-guarded-cycle-clock-20261016.json
node --test tests/sentinel-guarded-cycle.test.mjs tests/sentinel-thirty-second-objective.test.mjs tests/sentinel-expiry-objective.test.mjs tests/sentinel-base-deep-study.test.mjs tests/sentinel-video-consistency-20261016.test.mjs
git diff --exit-code a574f282 -- sentinel-trading-lab/agent sentinel-trading-lab/src sentinel-trading-lab/package.json
```

O ganho anterior ficou preservado como referência de pesquisa. As tentativas novas e suas limitações ficaram registradas. **Não há uma versão de 84% comprovada ao fim desta rodada.**
