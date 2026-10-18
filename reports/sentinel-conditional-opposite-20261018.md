# Teste solicitado: inversão condicional de CALL/PUT

**Implementado em cópia isolada do analista. A inversão funciona como especificada, mas os resultados são mistos e não comprovam melhora geral. Produção e bot permanecem intactos.**

Base: 13.9.43, commit `32ba17004713a085ac8f0e16adc28da739896634`. Os 75 arquivos do núcleo publicado continuam com seus hashes originais. Não houve implantação, alteração de saldo/configurações, envio de ordens ou leitura adicional de corretora. A cópia para pesquisa não incorpora a hipótese anterior de mudar a referência da projeção: utiliza a fórmula publicada.

## Regra operacional fixa

A solicitação foi interpretada como inverter quando o movimento deixa de ser contínuo na mesma direção, por oscilação ou retração. Não foi criado um indicador arbitrário de “extremo”. Para tornar o teste reproduzível, a regra foi registrada antes de calcular seus resultados:

- Construir quatro velas internas de observação de 10 segundos, todas já fechadas, a partir das cotações recebidas. Não são necessariamente as velas da escala visual escolhida na corretora.
- Se aparecem corpos positivos e negativos nessas quatro velas, classificar como direções misturadas e inverter.
- Se todos os corpos não neutros apontam para o mesmo lado, mas o movimento observado dos últimos seis segundos é contrário, classificar como retração e inverter.
- Com movimento contínuo de um lado, mercado totalmente plano, histórico incompleto, cotação velha ou ausência de sinal autorizado pelo motor, preservar a saída. Corpos neutros não inventam direção.
- Aplicar apenas às operações de 30 segundos, depois de todas as rotas estruturais e antes do ciclo que trava a direção. CALL vira PUT e PUT vira CALL uma única vez. Uma entrada ativa mantém seu lado até vencer, mesmo que o contexto mude.

Não se acrescenta sinal, espera, filtro de admissão ou prazo. O relógio, a cotação de entrada e o vencimento permanecem iguais. O seletor de projeções mantém seu aprendizado original. A saída final compartilhada pelo painel, celular e executor contém a direção transformada; não se inverte somente um rótulo visual. As previsões auxiliares não são fabricadas para aparentar concordância com a decisão experimental.

## Comparação dos mesmos sinais

Todos os conjuntos já haviam sido examinados em pesquisas anteriores. O nome de arquivo `validation` identifica um lote da pesquisa anterior e **não significa validação inédita deste teste**. O vídeo é uma única gravação extraída por OCR a 2Hz, já usada antes; não são ticks nativos nem comprovantes de liquidação.

Contagens mostram acertos/erros. Percentuais excluem empates. Empates e vencimentos ausentes são preservados.

| Conjunto | Atual A/E | Atual | Inversão A/E | Inversão | Sinais invertidos |
|---|---:|---:|---:|---:|---:|
| Forex conhecido (15 trechos) | 306/318 | 49,04% | 313/311 | 50,16% | 307 |
| Cripto de 15–17/10/2025 (9 trechos) | 300/228 | 56,82% | 222/306 | 42,05% | 480 |
| Cripto de 18–20/10/2025 (9 trechos) | 254/251 | 50,30% | 275/230 | 54,46% | 437 |
| Vídeo conhecido de EUR/GBP OTC (uma extração) | 11/3 | 78,57% | 4/10 | 28,57% | 14 |

No Forex foram 19 empates; na primeira cripto, 3; na segunda, 6. No vídeo há uma entrada final sem vencimento disponível. A inversão conserva cada um deles. Nas amostras de cripto a regra selecionou 480 de 531 sinais e 437 de 511, respectivamente: ela alcança grande parte das entradas, não somente raros episódios excepcionais.

| Conjunto | Erros corrigidos | Acertos transformados em erros | Trechos melhores | Piores | Maior sequência de erros por trecho |
|---|---:|---:|---:|---:|---:|
| Forex conhecido (15 trechos) | 155 | 148 | 8 | 4 | 7 → 7 |
| Cripto de 15–17/10/2025 (9 trechos) | 200 | 278 | 1 | 7 | 6 → 9 |
| Cripto de 18–20/10/2025 (9 trechos) | 227 | 206 | 5 | 3 | 8 → 9 |
| Vídeo conhecido de EUR/GBP OTC (uma extração) | 3 | 10 | 0 | 1 | 2 → 5 |

A comparação é pareada: cada sinal tem o mesmo ativo, instante, preço e prazo nas duas versões. Inverter troca acertos por erros e erros por acertos dentro da condição selecionada. As condições são classificadas apenas com observações anteriores à entrada, antes de consultar qualquer preço de vencimento. Não houve ajuste dos parâmetros depois dos resultados.

## Verificação funcional

Nove testes passaram: inversão nos dois sentidos e apenas uma vez; retração simétrica; preservação de movimento contínuo; WAIT, histórico insuficiente, cotação velha e outros prazos; exclusão de informação futura ou recebida tarde; direção imutável até o vencimento; lado correto no formato compacto do celular; carregamento da cópia isolada; fluxo completo analista → painel/celular → executor simulado tanto para IQ Option quanto Exnova. O executor usado nos testes é um mock e não envia ordens.

Quatro trechos também foram reexecutados com o runtime real completo, em duas versões: Forex de desempenho fraco, BTC em movimento favorável, SOL de desempenho fraco e o vídeo. Asserções verificaram que horários, preços e vencimentos são idênticos, e que a saída do runtime coincide exatamente com a classificação pareada em cada entrada. Os quatro resultados reproduziram o contrafactual. A análise de todas as janelas não depende de selecionar apenas sinais corrigidos.

## Estado para revisão

O teste pedido está preservado, inclusive seu resultado desfavorável em parte das amostras. Não se afirma que inverter aumentará a assertividade na sessão atual. A regra anterior que usava somente o rótulo `mixed-range` já havia piorado o vídeo; esta regra usa explicitamente corpos de velas internas e retração recente e também não demonstrou vantagem geral.

A implementação executável está em `experiments/conditional-opposite-runtime-20261018.mjs`. Ela cria um núcleo temporário, aplica a mudança e limpa a cópia ao terminar. O patch em `patches/sentinel-conditional-opposite-20261018.patch` contém a alteração concreta pronta para revisão: um módulo novo e sua chamada na saída final de `now-opportunity-engine.mjs`. `git apply --check` passou na base preservada. O patch não foi aplicado ao produto publicado.

Os dados externos são Forex Dukascopy e candles oficiais Binance de um segundo já preservados na pesquisa anterior, com proveniência e hashes. Não representam transporte, clique, vencimento ou liquidação da IQ/Exnova atual. O rollback original não foi alterado.

## Reprodução

1. `node --test tests/sentinel-conditional-opposite-20261018.test.mjs`
2. `node scripts/sentinel-conditional-opposite-ab-20261018.mjs`
3. `SENTINEL_OPPOSITE_FULL=1 node scripts/sentinel-conditional-opposite-ab-20261018.mjs`
4. `git apply --check patches/sentinel-conditional-opposite-20261018.patch`

As fixtures e os resultados originais são os da pesquisa de referência do preço real. O leitor do script aceita seus `.json.gz` preservados. As fontes externas podem ser regeneradas com os preparadores anteriores; o teste registra SHA256 de cada fixture. Os brutos desta rodada também são preservados comprimidos, contendo todos os sinais e suas condições.

## Todos os trechos

| Trecho | Atual A/E | Inversão A/E | Sinais invertidos |
|---|---:|---:|---:|
| development-08-utc | 27/27 | 28/26 | 35 |
| validation-14-utc | 22/31 | 25/28 | 35 |
| reserved-19-utc | 21/22 | 21/22 | 12 |
| second-validation-10-utc | 21/19 | 19/21 | 18 |
| second-validation-16-utc | 25/23 | 26/22 | 19 |
| second-validation-21-utc | 0/0 | 0/0 | 0 |
| third-validation-09-utc | 24/26 | 23/27 | 28 |
| third-validation-12-utc | 23/23 | 24/22 | 31 |
| third-validation-15-utc | 23/32 | 32/23 | 37 |
| third-validation-18-utc | 17/7 | 15/9 | 4 |
| fourth-validation-11-utc | 23/23 | 25/21 | 14 |
| fourth-validation-13-utc | 23/32 | 26/29 | 44 |
| fourth-validation-17-utc | 19/20 | 20/19 | 3 |
| fourth-validation-20-utc | 10/11 | 10/11 | 0 |
| available-official-2020-03-31-1829-utc | 28/22 | 19/31 | 27 |
| binance-btcusdt-2025-10-15-1500-utc | 31/28 | 27/32 | 50 |
| binance-ethusdt-2025-10-15-1500-utc | 36/23 | 24/35 | 54 |
| binance-solusdt-2025-10-15-1500-utc | 28/32 | 30/30 | 48 |
| binance-btcusdt-2025-10-16-1500-utc | 33/25 | 25/33 | 55 |
| binance-ethusdt-2025-10-16-1500-utc | 35/24 | 22/37 | 55 |
| binance-solusdt-2025-10-16-1500-utc | 29/30 | 29/30 | 54 |
| binance-btcusdt-2025-10-17-1500-utc | 38/21 | 20/39 | 56 |
| binance-ethusdt-2025-10-17-1500-utc | 36/22 | 24/34 | 54 |
| binance-solusdt-2025-10-17-1500-utc | 34/23 | 21/36 | 54 |
| binance-btcusdt-2025-10-18-1500-utc | 25/27 | 31/21 | 42 |
| binance-ethusdt-2025-10-18-1500-utc | 32/24 | 31/25 | 49 |
| binance-solusdt-2025-10-18-1500-utc | 25/30 | 29/26 | 49 |
| binance-btcusdt-2025-10-19-1500-utc | 31/25 | 31/25 | 50 |
| binance-ethusdt-2025-10-19-1500-utc | 28/29 | 32/25 | 50 |
| binance-solusdt-2025-10-19-1500-utc | 24/33 | 30/27 | 52 |
| binance-btcusdt-2025-10-20-1500-utc | 33/22 | 25/30 | 47 |
| binance-ethusdt-2025-10-20-1500-utc | 24/35 | 39/20 | 49 |
| binance-solusdt-2025-10-20-1500-utc | 32/26 | 27/31 | 49 |
| known-user-video-six-decimal-extraction | 11/3 | 4/10 | 14 |
