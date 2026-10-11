# Sentinel 67.2 — aprendizado direto de CALL/PUT, reversão e extremos

**Decisão: manter a versão publicada.** Houve melhora específica no horário de extremos, mas não uma estratégia consistentemente superior e coerente para o card. O melhor classificador ganhou 22 acertos em 2.208 previsões, sem ganho líquido em BTC; a direção em reversões piorou. Preços e direção divergiram em 24,05% das previsões, e houve 154 faixas em que o preço previsto de topo ficou abaixo do fundo.

Baseline: 13.4.67.2 build `13.4.67.2-strategy-copy-1011`, commit `66c42ff6da4e7af7268a933b9ff83ddfe0b9be90`. Pesquisa separada; nenhum código publicado, visual, função, instalador ou permissão de operação foi alterado.

## Hipótese implementada

A investigação anterior condicionou o aprendizado ao comportamento do preço e teve ganhos pequenos. Desta vez, o protótipo mudou o alvo:
- CALL/PUT treinado diretamente pelo sinal do retorno entre entrada e vencimento, com dois classificadores: ridge de rótulos e regressão logística.
- Máximo/mínimo de preço no intervalo futuro como alvos explícitos.
- Horário de topo/fundo como média condicional ou classe de horário mais provável, com bins nominalmente espaçados até 10s.
- Reversão como alvo específico: direção do intervalo futuro oposta aos 30s anteriores, com características simétricas de retornos.
- Seleção de parâmetros apenas em dados passados com separação temporal dos resultados. Scores brutos não são probabilidades calibradas de acerto.
- As contradições entre os componentes foram medidas, não escondidas nem corrigidas alterando artificialmente os números.

## Comparação em dados novos

Parâmetros, datas e sementes foram congelados antes de observar os resultados.

- 1.440 simulações com novas sementes, dez comportamentos e seis prazos.
- 2.208 previsões em oito novos arquivos reais de BTCUSDT/ETHUSDT: 01, 02, 05, 06/10/2026, 86.400 barras de 1s cada; checksum SHA256 original verificado e registrado no JSON.
- Mesmas cotações, 3.600 pontos de histórico e horários. Emissão em T; entrada T+H e vencimento T+2H; prazos 5, 10, 30, 60, 120 e 300s. Barra de 1s observável após o fechamento.
- Cobertura 100% nos testes. Todos os erros foram contados; nenhum sinal foi suprimido para melhorar percentual.
- 154 resultados reais sem alteração de preço não são vitórias. Também apresentamos o denominador sem empate, 2.054 casos.
- Dados externos de spot, não IQ Option/Exnova: estes números não medem a taxa observada pelo usuário, execução ou rentabilidade.

| Direção | 67.2 | Novo classificador ridge | Novo classificador logístico |
|---|---:|---:|---:|
| Simulações | 72,22% | 74,24% | 72,15% |
| Preços reais, todos os casos | 44,79% (989/2.208) | 45,79% (1.011/2.208) | 45,38% (1.002/2.208) |
| Preços reais, sem empate | 48,15% | 49,22% | 48,78% |
| Direção nos 966 casos de reversão | 50,21% | 48,76% | 47,83% |

Ridge corrigiu 299 erros e prejudicou 277 acertos; logístico corrigiu 297 e prejudicou 284. O benefício líquido é pequeno frente à quantidade de decisões alteradas.

## Estabilidade por ativo e prazo

Ridge: BTC ficou em 497 acertos, igual à base; ETH passou de 492 para 514. Logístico: BTC caiu de 497 para 495; ETH passou de 492 para 507. Não houve ganho consistente nos dois ativos.

| Prazo | 67.2 | Direção ridge | Direção logística |
|---|---:|---:|---:|
| 5s | 36.96% | 38.32% | 37.77% |
| 10s | 38.32% | 42.66% | 42.39% |
| 30s | 48.91% | 46.74% | 45.65% |
| 60s | 43.21% | 45.38% | 43.48% |
| 120s | 47.55% | 47.28% | 47.83% |
| 300s | 53.80% | 54.35% | 55.16% |

Em 30s, ambas as alternativas pioraram. O intervalo descritivo de ganho com reamostragem por arquivo foi -0,32 a +2,17 pontos para ridge e -1,40 a +2,36 para logístico. Oito arquivos externos e várias hipóteses: a pequena diferença agregada não comprova superioridade generalizável.

## Avanço específico nos horários de topo e fundo

Somente prazos >=30s entram na avaliação de extremos: 1.472 casos. Uma tolerância de ±10s em um intervalo de 5s/10s não seria uma medida útil.

| Horário dentro de ±10s | 67.2, extremos da trajetória média | Alvo direto, média de horário | Alvo direto, horário mais provável |
|---|---:|---:|---:|
| Topo | 24,59% | 22,08% | 30,30% |
| Fundo | 25,61% | 22,01% | 31,39% |

O horário mais provável melhorou +5,71 pontos para topo e +5,78 para fundo. A média do horário piorou, mostrando que representar a distribuição do evento importa. Mesmo a alternativa melhor ainda erra a tolerância em aproximadamente sete de cada dez casos.

| Prazo | Topo 67.2 | Topo mais provável | Fundo 67.2 | Fundo mais provável |
|---|---:|---:|---:|---:|
| 30s | 48.10% | 57.07% | 43.75% | 49.46% |
| 60s | 23.91% | 32.61% | 27.45% | 38.86% |
| 120s | 14.95% | 19.57% | 18.75% | 22.83% |
| 300s | 11.41% | 11.96% | 12.50% | 14.40% |

A média do erro de horário passou de 58,18 para 55,98s no topo e de 56,71 para 53,35s no fundo. O preço do extremo não melhorou: erro médio do topo 12,55 para 12,57 pontos-base e fundo 12,10 para 13,51.

## Reversão e coerência para exibição

O alvo específico de reversão reduziu falsos alertas de 520 para 471; manteve 485 detecções corretas e 481 reversões perdidas. Precisão 48,26% para 50,73%; recuperação 50,21%, igual à base. Isso não resolveu as retrações perdidas.

Direção e preços de entrada/vencimento discordaram em:
- Ridge: 531/2.208, ou 24,05%.
- Logístico: 693/2.208, ou 31,39%.

Uma direção mais provável pode diferir do sinal do movimento médio em uma distribuição assimétrica, portanto discordância não prova por si só que o classificador esteja matematicamente errado. Entretanto, o card exige que a decisão e os preços apresentados sejam coerentes, e este protótipo não fornece essa representação conjunta.

154/2.208 previsões de faixas tiveram topo abaixo de fundo (6,97%) porque preços foram estimados por componentes independentes, com seleção própria de parâmetros. Nenhum resultado foi ajustado à força para esconder isso.

O aviso separado de reversão discordou da direção principal em 35,87% das previsões ridge e 38,63% das logísticas. Esses componentes não devem ser publicados juntos como se representassem um cenário único validado.

## Conclusão

Aprender diretamente o horário mais provável de topo/fundo mostrou um ganho específico. Aprender CALL/PUT diretamente trouxe ganho pequeno, concentrado em um ativo, com perdas em reversões. Os componentes separados ainda não representam uma previsão conjunta coerente. Esta pesquisa não entrega a melhoria radical desejada e não justifica substituir a 67.2.

A condição para um próximo candidato é produzir uma distribuição conjunta que vincule direção, preços de entrada/vencimento e extremos do mesmo cenário, com incerteza verificável. Isso não foi implementado nem validado por este experimento e não é promessa de resultado.

## Verificação e reprodução

- Cinco contratos passaram: alvos completos e purgados, intervalo direto, rejeição de futuro/backfill e de rótulos externos, invariância de densidade, dados planos e cotações ausentes/desatualizadas.
- Comparação de Git confirmou que a versão publicada ficou byte a byte intacta.
- Execução: https://github.com/hassan80612/DEVINX/actions/runs/38185849447
- Plano congelado: [DIRECT-EVENT-TARGETS-FROZEN-2026-10-11.md](DIRECT-EVENT-TARGETS-FROZEN-2026-10-11.md).
- Métricas persistidas: [simulações](DIRECT-EVENT-SYNTHETIC-2026-10-11.json) e [preços reais](DIRECT-EVENT-EXTERNAL-2026-10-11.json).
- Sementes e scripts persistidos no branch. O artefato da execução contém detalhes completos, decisões por caso e checksums, com retenção de 14 dias.
