# Sentinel — análise da abertura e confirmação de entrada

Status: protótipo local; não publicado. A produção permanece na 13.4.67.26.

A comparação causal usou cotações simuladas, dois cenários aleatórios por tipo e três configurações (Contínua automática, Contínua breakout e Seletiva). Cada previsão recebeu somente o passado disponível naquele instante. Os resultados são das entradas efetivamente confirmadas até seu vencimento, não da direção da vela atual. Os mesmos dados foram usados entre estratégias; os totais abaixo não são amostras independentes nem estimativas de acerto real.

| Cenário simulado | 67.26: acertos / erros | Protótipo: acertos / erros |
|---|---:|---:|
| Movimento contínuo forte | 180 / 0 | 178 / 0 |
| Lateral sem direção | 48 / 49 | 0 / 0 |
| Oscilação lateral regular | 180 / 0 | 92 / 0 |
| Retrações recorrentes | 160 / 5 | 84 / 1 |
| Tendência muda para lateral | 69 / 56 | 8 / 12 |

Não houve troca de direção dentro da janela nem entrada repetida. A classificação e a força do movimento foram usadas apenas para selecionar evidência histórica comparável; não determinaram CALL/PUT.

O protótipo preserva rejeições do modelo, elimina a autorização permissiva de 46% e aplica a mesma auditoria à abertura e à confirmação. A auditoria verifica previsões passadas do próprio estimador, em intervalos não sobrepostos, e exige um limite inferior de confiança acima de 50%, com pelo menos seis casos. Isso não transforma histórico em probabilidade futura calibrada.

Decisão: não publicar. A filtragem eliminou perdas e também muitas entradas vencedoras. Na transição de tendência para lateral, os sinais restantes continuam sem vantagem demonstrada. Ajustar mais filtros para esses poucos exemplos arriscaria adaptar o programa aos testes. A amostra real disponível tem apenas 179 segundos e é insuficiente para validar esse comportamento.

Reprodução: exportar o diretório sentinel-trading-lab/agent/src/core do commit 7cd0e7315fd7b6a59ad82142ffc8db7491c902ca para um diretório separado. Executar scripts/sentinel-entry-evidence-compare.mjs passando o caminho absoluto do future-entry-schedule.mjs exportado e o arquivo de saída. SENTINEL_COMPARE_CASES aceita continuous-strength,lateral,retracement,trend-to-lateral,lateral-range. O quarto argumento, opcional, reutiliza somente os resultados de controle de uma execução anterior com as mesmas sementes; nunca alimenta o preditor.
