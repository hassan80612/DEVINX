# Revisão independente da base do Sentinel 13.9.36

**Resultado: duas inconsistências de cálculo foram corrigidas em uma versão isolada de teste. A melhora consistente de assertividade ainda não foi demonstrada. A correção conjunta não foi publicada.**

A versão pública foi confirmada pelo manifesto como 13.9.36, build `13.9.36-observed-timestamp-sampling`. Os 111 arquivos locais do Agent foram comparados com o payload do instalador anteriormente verificado e continuam idênticos. Nenhum instalador, site, banco de dados ou ordem real foi alterado.

## 1. Direção e força usavam objetivos diferentes

O comparador de padrões selecionava CALL/PUT pelo sinal do retorno médio ponderado dos exemplos passados, mas calculava sua força pela diferença entre os votos ponderados de CALL e PUT. Um movimento raro, grande e contrário podia inverter a direção sem inverter a força que autorizava essa decisão.

Um exemplo determinístico reproduz isso: o módulo publicado escolhe PUT, embora os votos ponderados favoreçam CALL e a força seja 0,5034. O caso espelhado reproduz o mesmo problema no outro sentido. Esses exemplos verificam a incoerência matemática, não uma taxa de acerto de mercado.

A correção usa os votos ponderados para escolher a direção, preservando exemplos, pesos, limites e retorno médio informativo. A força permanece uma medida de concordância entre exemplos correlacionados; ela não é uma probabilidade calibrada de vitória.

## 2. Aprendizado podia ser avaliado depois do vencimento

O seletor de projeções avaliava exemplos vencidos pelo preço do próximo ciclo de análise, até um segundo depois do prazo. A contagem de resultados observados também buscava a primeira cotação posterior ao vencimento. Uma mudança nessa fração de segundo podia alterar qual modelo parecia correto.

A correção usa a última cotação realmente recebida no prazo ou antes dele, com idade máxima de um segundo. A cotação atual explícita também é aceita quando seu timestamp está no prazo; nunca se empresta um movimento posterior. Sem referência válida, não se inventa um resultado. Um exemplo controlado reproduz os modelos sendo avaliados no sentido contrário após uma reversão posterior ao vencimento.

Isso corrige consistência temporal de cotações observadas. Não transforma essa contagem em liquidação de uma ordem da corretora, nem corrige por si só diferenças entre o clique do usuário e o instante do sinal.

## Comparação do motor completo

Quatro variantes foram comparadas com o mesmo avaliador externo de resultados, sem alterar sua regra para favorecer a correção:

| Dados externos | Publicado | Só votos binários | Só avaliação no prazo | Duas correções |
|---|---:|---:|---:|---:|
| 14 trechos conhecidos de 30/03/2020 | 278 acertos / 296 erros | 279 / 295 | 277 / 297 | 278 / 296 |
| Novo trecho de 31/03/2020 | 28 / 22 | 28 / 22 | 28 / 22 | 28 / 22 |

No conjunto conhecido, os percentuais são respectivamente 48,43%, 48,61%, 48,26% e 48,43%. No trecho novo, todas ficaram em 56%. Os 18 empates do conjunto conhecido e o empate do trecho novo ficam fora desses denominadores. Não há saída ausente nesses dados externos.

No vídeo antigo, ambas as extrações conservaram todas as entradas: a mais precisa permaneceu em 11 acertos/3 erros e a outra em 10/3. Cada uma tem uma saída ausente. São duas extrações do mesmo vídeo e não podem ser somadas como evidências independentes.

Em todas essas comparações, as quatro variantes conservaram exatamente os horários, preços de entrada e prazos completos de 30 segundos. Não foi acrescentado um temporizador de confirmação ou mais histórico em memória. Os oito cenários sintéticos de estresse também conservaram seus resultados; eles verificam comportamento e não estimam assertividade real.

## Dados novos e limitações da validação

Antes da avaliação, foram registrados seis trechos em dois dias ainda não utilizados, a partir de arquivos horários oficiais da Dukascopy. A obtenção completa falhou com timeouts e HTTP 502. Esse plano de seis trechos não foi concluído e não é apresentado como validado.

Os únicos blocos horários novos consecutivos obtidos integralmente foram 17h/18h UTC de 31/03/2020. Antes de avaliar suas entradas, foi registrada uma validação alternativa entre 18h29 e 18h59 UTC. Ela possui 1.339 segundos com cotações reais, sem preencher os segundos ausentes, 89 velas fechadas disponíveis no início e cobertura de preços além do último vencimento. Essa escolha ocorreu por disponibilidade dos arquivos, não pelo resultado do motor. O trecho agora é conhecido e não deve ser tratado como uma nova validação intocada.

O decodificador dos arquivos BI5 foi conferido contra 10.124 ticks de um arquivo já conhecido de 30/03/2020, reproduzindo seus timestamps e preços de compra/venda. Os bytes originais e seus hashes foram preservados em arquivos base64 para reprodução local. A proveniência identifica cada arquivo oficial. As velas de um minuto são agregadas desses ticks; não são velas nativas da corretora.

Todos esses dados são EUR/USD Forex externo, não a sessão atual de OTC do usuário, nem ordens executadas. O teste novo contém só um trecho de outro dia e não estabelece estabilidade entre dias, corretoras ou regimes.

## Verificação

- 13 testes novos passaram: exemplos espelhados, coerência de classe/força, causalidade, escala de preços, preços inválidos, referência do vencimento, cotação atual explícita, recuperação de uma avaliação atrasada e ausência/empate de resultados.
- 84 testes existentes passaram contra a cópia corrigida, incluindo vídeo, direção compartilhada, projeção adaptativa, amostragem, níveis históricos, sequência e janela de operação. Nenhuma asserção dos testes existentes foi removida ou alterada.
- O patch passou pela verificação de aplicação sem modificar os arquivos do Agent publicado.
- Os testes de cálculo e os replays não verificam o lançamento nativo no Windows nem latência real de clique/transporte.

As correções são revisáveis, mas o teste conjunto não sustenta uma melhora de assertividade. Portanto, esta revisão não declara o problema de previsão resolvido, não estabelece 70%, 80% ou 90% em operação real e não libera uma nova versão como solução de desempenho.

## Reprodução

`node --test tests/sentinel-binary-objective.test.mjs tests/sentinel-observed-expiry-quote.test.mjs`

`node scripts/sentinel-binary-objective-existing-tests-20261018.mjs`

`node scripts/sentinel-binary-objective-ab-20261018.mjs`

`python scripts/sentinel-prepare-available-official-ticks-20261018.py`

`SENTINEL_BINARY_SET=available-holdout node scripts/sentinel-binary-objective-ab-20261018.mjs`

`SENTINEL_BINARY_SET=stress node scripts/sentinel-binary-objective-ab-20261018.mjs`

`node scripts/sentinel-build-objective-patch-20261018.mjs`
