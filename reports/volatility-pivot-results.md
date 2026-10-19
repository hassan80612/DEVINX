# Teste de pivôs por volatilidade e confirmação de estrutura

Detector implementado e testado em isolamento. Nove testes passaram: causalidade, confirmação após o extremo, fechamento real dos pontos menores, imutabilidade, simetria CALL/PUT, escala de volatilidade, lacunas, troca de ativo, evento único, memória limitada e liberação somente no instante atual de avaliação. Nenhum sinal foi atribuído retroativamente ao topo ou fundo.

A regra foi fixada antes de avaliar os resultados: ATR de 14 barras já fechadas de 5 segundos, reversão de 1,5 ATR congelada no extremo e rompimento de um pivô menor confirmado no mesmo movimento. Não houve busca de parâmetros. O ciclo do candidato é próprio, sem entradas sobrepostas: cada operação dura 30 segundos depois da decisão atual. Um evento ocorrido durante uma operação aberta é consumido, sem ficar na fila para entrada atrasada.

| Amostra externa | Analista 13.9.45 | Detector novo | Entradas sem empate do novo | Proporção da quantidade original |
|---|---:|---:|---:|---:|
| Forex, 15 trechos conhecidos | 49,04% (306/318) | 60,78% (31/20) | 51 | 8,17% |
| Cripto, 15–17/10/2025, nove trechos conhecidos | 56,82% (300/228) | 49,45% (134/137) | 271 | 51,33% |
| Cripto, 18–20/10/2025, nove trechos conhecidos | 50,30% (254/251) | 55,68% (103/82) | 185 | 36,63% |

Os pares entre parênteses são acertos/erros, excluindo empates. Com valor fixo de 1 e payout ilustrativo de 86%, o detector resultou em +6,66, −21,76 e +6,58 unidades, respectivamente. A maior sequência de perdas por trecho foi 3, 5 e 5, contra 7, 6 e 8 da base. São resultados de direção em dados externos; não são liquidações de operações na IQ Option ou Exnova.

A base em cache foi comparada com o núcleo publicado 13.9.45 em um trecho integral de cada grupo: as 54, 59 e 52 entradas coincidiram exatamente, incluindo horário, direção, preço e resultado. Os 33 arquivos derivados têm SHA256 registrado. Foram usados os mesmos instantes observados de avaliação para os dois algoritmos. O detector pode aproveitar histórico anterior, sem coletar candles novos a cada operação. Seus eventos entre avaliações só podem ser admitidos no preço da avaliação seguinte, se a confirmação ainda for válida.

Neste detector novo, a distância mediana entre o extremo e a entrada foi de aproximadamente 12,3 s no Forex, 11 s no primeiro lote de cripto e 15 s no segundo; alguns casos levaram mais de 40 s. Isso explica por que um bom marcador visual de topos/fundos não equivale automaticamente a uma boa previsão dos próximos 30 s. Essas medidas não atribuem o atraso do detector experimental ao analista atual.

Os testes exploratórios com o vídeo conhecido e pequenos buffers nativos estão no relatório privado. Não há reconstrução exata dos sinais originais, nem amostra independente suficiente para alegar melhora no OTC.

**Resultado: não aprovado para substituir o analista.** O primeiro lote de cripto piorou e a cobertura do Forex ficou abaixo dos 25% fixados. Nenhum novo holdout foi consumido. Bot, site e versão em produção permanecem preservados.

Reprodução: `node --test tests/volatility-pivot-structure.test.mjs`; `node scripts/volatility-pivot-compare.mjs CAMINHO_DAS_FONTES`; `node scripts/volatility-pivot-native.mjs RELATORIO_PRIVADO SAIDA_PRIVADA`. O primeiro caminho deve conter `tests/fixtures/external/` com os arquivos derivados das fontes fixadas, cujos metadados, URLs e hashes constam do relatório comprimido. O cache compacto de entradas de referência acompanha este experimento. Para o controle de base, os três arquivos corrigidos de vencimento devem corresponder ao commit 14a0d0dc4c9f278708a79d22b9bd25d70c0e2491.
