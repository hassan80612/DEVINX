# Analista Sentinel — diagnóstico após confirmação de que o bot executou

O usuário confirmou que o bot funcionou na 13.9.42 e relatou perdas nos sinais. O executor, seus pontos por corretora e o motor publicado não foram alterados. Produção conferida em `dpl_8EYzJSbiFrM4UToCNCiACDngw4wN`, commit `fd7e026ce4b981a53e7da62722306e1eae364c60`. Nenhuma nova versão foi publicada.

## O que os dados sustentam

O relatório já existente de atribuição da 13.9.37 registrava 306 acertos/318 erros (49,04%, excluindo 19 empates) em quinze trechos Forex externos já inspecionados. Não era uma sessão OTC do usuário. A 13.9.38 corrigiu integridade de cotações, saldo e isolamento; não estabeleceu um aumento de assertividade. As versões 13.9.39 a 13.9.42 adicionaram/corrigiram execução local sem substituir esse motor.

O voto de padrões usa exemplos espaçados em quatro segundos para horizontes de trinta segundos. O seletor entre projeções registra ensaios a cada cinco segundos para resultados de trinta segundos. Portanto, muitos exemplos compartilham o mesmo movimento futuro. A concordância desses exemplos não é uma probabilidade calibrada de ganho e a quantidade bruta não equivale a observações independentes.

## Hipótese testada, sem mexer na produção

Foi registrada antes da avaliação uma única mudança: no seletor de projeções, iniciar o próximo ensaio de aprendizagem apenas quando o anterior tiver vencido, usando seu vencimento efetivo. As entradas reais não aguardam aprendizagem; previsões, pesos, critérios, níveis e ciclo de trinta segundos foram mantidos. As cópias temporárias do núcleo são removidas ao concluir.

Quatro testes passaram para ensaios não sobrepostos, ausência de espera nas entradas atuais, vencimento explícito, exclusão de preços futuros e isolamento de contexto. Isso valida a implementação, não a qualidade de previsão.

| Trecho Forex conhecido | Atual: acertos/erros | Candidato: acertos/erros |
|---|---:|---:|
| 30/03/2020 08:00 UTC | 27/27 | 27/27 |
| 30/03/2020 14:00 UTC | 22/31 | 22/31 |
| 30/03/2020 19:00 UTC | 21/22 | 21/22 |
| Total | 70/80 (46,67%) | 70/80 (46,67%) |

Houve um empate inalterado e nenhuma saída ausente. As listas de sinais e seus resultados foram idênticas nos três trechos; os diagnósticos do candidato confirmam que a cadência modificada foi exercitada e não houve sobreposição dos ensaios de aprendizagem. Nenhuma regra foi ajustada após ver esses resultados. A alteração não demonstrou ganho e foi rejeitada como solução de assertividade.

## Validação separada indisponível

Antes de avaliar o candidato foram reservados 01/04/2020 e 02/04/2020, 14:00–14:30 UTC, com histórico de duas horas. As seis consultas aos arquivos oficiais retornaram timeout, HTTP 429 ou HTTP 502, impedindo formar os dois trechos completos. O decodificador foi validado em 5.364 cotações bid do arquivo de referência antigo, sem inspecionar resultados novos. Dados conhecidos não foram substituídos e chamados de validação nova.

Sem uma validação separada disponível e sem melhoria nos trechos de desenvolvimento, não há fundamento para publicar esse candidato. Dois dias, mesmo com ganho, ainda não demonstrariam vantagem duradoura nem resultado em OTC.

## Limite prático desta análise

Os resultados das operações recém-executadas pelo usuário permanecem no computador dele; não foram fornecidos nesta conversa. Os replays não modelam a plataforma OTC, cliques reais nem pagamentos da corretora. Um vídeo contínuo mostrando sinal, momento do clique, preços de entrada/encerramento e resultado permitiria examinar essas perdas específicas, mas algumas entradas isoladas não validariam uma taxa global de acerto.

Reprodução: `node --test tests/sentinel-independent-expiry-samples-20261018.test.mjs`; `node scripts/sentinel-independent-expiry-ab-20261018.mjs development`; `python scripts/sentinel-prepare-independent-expiry-data-20261018.py`; `node scripts/sentinel-independent-expiry-ab-20261018.mjs validation`.
