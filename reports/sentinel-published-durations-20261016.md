# Comparação dos tempos — Sentinel 13.9.23

Código publicado: a574f282eebef6e0aeaca988cf5bc1c7d7d3db4e. O seletor publicado oferece 5s, 10s, 15s e 30s. Não foi usada nenhuma candidata experimental.

Reconstrução do mesmo vídeo do usuário, preços da corretora com seis casas decimais e observações a cada 500ms quando legíveis. Não é uma medição da sessão atual ao vivo.

| Duração | Favoráveis | Desfavoráveis | Empates | Sem desfecho | Taxa sem empates |
| --- | ---: | ---: | ---: | ---: | ---: |
| 5s | 12 | 9 | 3 | 0 | 57.1% |
| 10s | 8 | 7 | 0 | 0 | 53.3% |
| 15s | 4 | 5 | 0 | 0 | 44.4% |
| 30s | 9 | 5 | 0 | 1 | 64.3% |

30s apresentou a maior taxa nesta reconstrução: 9 favoráveis em 14 desfechos sem empate (64,3%). O sinal final não tinha vencimento observado. Em 5s, os três empates ficaram fora do denominador da taxa; incluindo-os como resultados não favoráveis, são 12/24 = 50%.

Na extração anterior do card, arredondada a cinco casas e 1Hz, as taxas foram 31,3% / 46,2% / 37,5% / 53,8% para 5s / 10s / 15s / 30s. As diferenças de precisão e amostragem alteram entradas e classificação; as duas extrações são o mesmo vídeo e não foram combinadas. 30s ficou em primeiro em ambas.

Contando somente sinais iniciados após os primeiros 180s do vídeo, a extração a seis casas apresentou 40% / 50% / 20% / 60%; novamente, 30s foi a maior taxa. Isso é análise retrospectiva da mesma sessão, não validação independente ou garantia de desempenho futuro.

Cada prazo usa seus próprios ciclos não sobrepostos. A liquidação usa a primeira cotação observada a partir do vencimento até no máximo 1s depois, sem interpolação. Nos dados a seis casas, houve uma liquidação após o instante exato em cada um dos prazos 10s, 15s e 30s; os horários estão no JSON.

Reproduzir: `node research/published-duration-comparison.mjs`. O JSON preserva sinais, preços e horários de todas as durações, nas duas extrações e nos dois recortes. Nenhum arquivo operacional foi alterado.
