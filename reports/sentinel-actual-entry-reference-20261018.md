# Projeção de 30s e cotação real de entrada — hipótese não aprovada

**A assertividade ainda não foi resolvida. A mudança melhora modestamente os nove trechos novos, mas falha na exigência registrada de melhorar os dois mercados conhecidos e piora o vídeo conhecido da corretora. Nenhuma publicação ou operação financeira foi feita.**

Base: 13.9.43, commit `32ba17004713a085ac8f0e16adc28da739896634`. Oito testes passaram. Os 75 arquivos do núcleo publicado foram conferidos por hash Git e continuam intactos; a implementação experimental só cria e remove uma cópia temporária do núcleo. Bot, site, instalador e controles não foram modificados. A preservação do rollback original não depende desta pesquisa.

## Hipótese única, fixada antes da validação

O modelo ajusta níveis de log-preço relativos à cotação real atual. A regra publicada calcula `f(t+30) - f(t)`, deslocando a projeção pelo resíduo presente. A candidata calcula apenas `f(t+30)`, comparando o nível ajustado de vencimento diretamente com a cotação real de entrada. A mesma alteração alcança as buscas estreita e ampla de períodos. Não há parâmetro reajustado, indicador, temporizador ou filtro novo.

Isso testa duas hipóteses sobre o desvio entre o preço e a curva: preservá-lo na projeção ou removê-lo. A fórmula antiga não foi classificada como erro matemático comprovado: um desvio pode persistir. Os testes de mercado são justamente necessários para decidir se a alternativa melhora a previsão. Um exemplo controlado em que uma fórmula perde e a outra ganha não demonstra vantagem real.

Admissões e rotas históricas conservam seu código. Seus resultados podem mudar porque a direção da projeção participa dos conflitos, alterando a oportunidade de entrada e as seguintes. Por isso foi reexecutado o ciclo completo; não se selecionaram apenas operações que a mudança teria corrigido.

## Resultado completo

Contagens no formato acertos/erros/empates; percentuais excluem empates. Nenhum vencimento ficou sem cotação nesses três conjuntos.

| Conjunto | Atual A/E/T | Atual | Candidata A/E/T | Candidata |
|---|---:|---:|---:|---:|
| 15 trechos de Forex conhecidos | 306/318/19 | 49,04% | 308/316/19 | 49,36% |
| 9 trechos de cripto conhecidos | 300/228/3 | 56,82% | 300/230/1 | 56,60% |
| 9 trechos de cripto novos | 254/251/6 | 50,30% | 263/240/6 | 52,29% |

Na cripto conhecida, a maior sequência de erros por trecho aumentou de 6 para 7. Na validação nova, diminuiu de 8 para 7. No Forex conhecido permaneceu em 7.

O vídeo já usado de EUR/GBP OTC, extraído por OCR a 2Hz e não por ticks nativos, caiu de 11 acertos/3 erros para 9/5, nos mesmos 14 vencimentos completos. Uma última entrada não tinha vencimento disponível em ambas as variantes. É uma única gravação conhecida, não validação nova nem recibo de liquidação. Não foi somada como outra sessão de ticks.

## Validação nova e proveniência

Antes de observar os resultados foram registrados BTCUSDT, ETHUSDT e SOLUSDT, nos dias 18, 19 e 20/10/2025, sempre 15:00–15:30 UTC. Os nove arquivos oficiais Binance foram obtidos, com hashes verificados contra seus CHECKSUM publicados. Não houve janela descartada. O preço é o fechamento observado de cada segundo, disponível após o segundo completar; não se interpola o caminho intrassegundo. Candles de um minuto usam apenas segundos completos e entram após fechar o minuto.

Esses dados não reproduzem IQ/Exnova OTC, transporte do Windows, clique, payout ou liquidação. Ganhar cerca de dois pontos percentuais neste conjunto não comprova a meta do usuário nem desempenho na corretora.

| Trecho novo | Atual A/E/T | Atual | Candidata A/E/T | Candidata |
|---|---:|---:|---:|---:|
| btcusdt-2025-10-18 | 25/27/0 | 48,08% | 27/24/0 | 52,94% |
| ethusdt-2025-10-18 | 32/24/0 | 57,14% | 34/21/0 | 61,82% |
| solusdt-2025-10-18 | 25/30/1 | 45,45% | 25/30/1 | 45,45% |
| btcusdt-2025-10-19 | 31/25/1 | 55,36% | 32/24/1 | 57,14% |
| ethusdt-2025-10-19 | 28/29/0 | 49,12% | 27/30/0 | 47,37% |
| solusdt-2025-10-19 | 24/33/2 | 42,11% | 22/35/2 | 38,60% |
| btcusdt-2025-10-20 | 33/22/1 | 60,00% | 32/23/1 | 58,18% |
| ethusdt-2025-10-20 | 24/35/0 | 40,68% | 31/28/0 | 52,54% |
| solusdt-2025-10-20 | 32/26/1 | 55,17% | 33/25/1 | 56,90% |

## Entradas e contrafactuais

Comparações pareadas usam somente instantes comuns. As entradas que deixam de coincidir no tempo não são tratadas automaticamente como perdas evitadas ou acertos corrigidos.

| Conjunto | Trechos melhores | Piores | Erros corrigidos no mesmo instante | Acertos estragados no mesmo instante | Acertos originais sem entrada no mesmo instante | Entradas candidatas em novos instantes |
|---|---:|---:|---:|---:|---:|---:|
| known | 1 | 0 | 3 | 1 | 0 | 0 |
| crypto | 4 | 5 | 9 | 6 | 108 | 194 |
| validation | 5 | 3 | 9 | 5 | 62 | 124 |

Também foram avaliadas as duas projeções isoladamente nos instantes originais de entrada, mantendo referência e vencimento fixos. Essa análise é diagnóstica, não um segundo teste de estratégia: a projeção pode estar indisponível enquanto uma rota estrutural autoriza o sinal.

| Conjunto | Projeção atual A/E | Projeção candidata A/E | Atual indisponível | Candidata indisponível |
|---|---:|---:|---:|---:|
| known | 5/9 | 6/8 | 629 | 629 |
| crypto | 255/273 | 248/280 | 0 | 0 |
| validation | 265/240 | 251/254 | 0 | 0 |

No conjunto novo a projeção isolada piorou de 265/240 para 251/254, embora o motor completo tenha melhorado. A interação com os instantes de admissão importa; não é correto atribuir o ganho agregado a uma previsão de 30s comprovadamente melhor.

## Funcionamento e decisão

Oito testes cobrem desvio de preço nos dois sentidos, preservação da rejeição por variação insuficiente, exclusão de preços futuros ou recebidos tarde, prazo explícito, entradas inválidas, imutabilidade da direção durante os 30s e preservação das decisões em outros horizontes. O relatório também verifica hashes de fixtures, todas as entradas com duração de 30s e ausência de sobreposição de sinais. As contagens da base reproduzem os resultados previamente preservados nos dois conjuntos conhecidos.

Não há espera intencional adicional ou consulta à corretora: a mudança troca uma expressão após o mesmo ajuste. Tempos de replay estão nos arquivos brutos, por janela e variante; não medem execução no PC do usuário. Passar em testes de software não significa melhorar a previsão.

**Candidata rejeitada como correção geral.** A próxima evidência necessária é uma sequência de cotações e sinais nativos do ativo em que o usuário está perdendo. Os snapshots remotos atuais resumem o mercado e não transportam o histórico completo necessário para reproduzir essas entradas. Repetir filtros já rejeitados ou publicar esta alteração como solução não atende ao resultado pedido.

## Reprodução e dados brutos

1. `python scripts/sentinel-actual-entry-reference-fetch-20261018.py`
2. `node --test tests/sentinel-actual-entry-reference-20261018.test.mjs`
3. `SENTINEL_REFERENCE_SET=known node scripts/sentinel-actual-entry-reference-ab-20261018.mjs`
4. Repetir o comando anterior com `crypto` e `validation`.
5. `node scripts/sentinel-actual-entry-reference-video-20261018.mjs`
6. `python scripts/sentinel-actual-entry-reference-report-20261018.py`

As fixtures conhecidas são as mesmas da pesquisa anterior. As novas são reproduzíveis pelos URLs e hashes do manifesto. O avaliador só consulta o vencimento depois de as duas funções de decisão retornarem. O bruto contém preços de entrada, direções, prazos, motivos e resultados; não contém credenciais, saldo ou ordens da sessão atual do usuário.

- `sentinel-actual-entry-reference-ab-20261018-known.json.gz` — SHA256 `2271ad90fcf369b0abbd83c5861346d32dc844e9ddd9fecee33d4551bdc53383`.
- `sentinel-actual-entry-reference-ab-20261018-crypto.json.gz` — SHA256 `3ae4c78027d284b12b4078ca70f122b801773522a5527ea19eed939f01a326be`.
- `sentinel-actual-entry-reference-ab-20261018-validation.json.gz` — SHA256 `81467816b1c2b312dadaeea6f53caefc5a02239a76ffdb5f4adea0edf9e19396`.
