# Entrada durante retração e referência do contrato Digital

**Não foi demonstrada uma melhora de assertividade. A regra nova de entrada falhou na triagem registrada e não foi integrada. A auditoria identificou uma possível incompatibilidade de alvo no Digital que exige confirmar o contrato real do usuário. Nenhuma operação, configuração de bot ou publicação foi realizada.**

Base: 13.9.43, commit `32ba17004713a085ac8f0e16adc28da739896634`. Os 75 arquivos do núcleo publicado continuam idênticos por hash. Esta rodada não incorpora nem ativa a inversão solicitada no experimento anterior.

## Caminho do preço após os sinais

Foram usados os mesmos 15 trechos conhecidos de Forex, dois lotes conhecidos de nove trechos de cripto e uma extração conhecida por OCR do vídeo da corretora. Os sinais continuam sendo os originais. Os preços futuros são consultados somente pelo diagnóstico, depois da decisão; não podem ser usados para selecionar uma entrada em tempo real.

No Forex, 92 de 318 perdas estavam favoráveis ao sinal após cinco segundos; 107 dos 306 acertos estavam contrários nesse mesmo instante. No primeiro lote de cripto, esses números foram 82 perdas inicialmente favoráveis e 97 acertos inicialmente contrários. No segundo, foram 68 e 67. Isso não sustenta um simples atraso fixo ou a exigência genérica de cinco segundos favoráveis como solução. Uma análise do caminho não demonstra que seria possível obter a mesma direção antes de o sinal existir.

75 perdas de Forex, 59 do primeiro lote de cripto e 90 do segundo nunca tiveram cotação observada favorável entre entrada e vencimento. Esses casos não são explicados como sinais que começaram bons e apenas reverteram no final. O diagnóstico não identifica sozinho a causa das cinco bancas perdidas pelo usuário.

## Hipótese específica de retração

Regra fixada antes de pontuar: tendência anterior de 90s, excluindo os últimos 6s; uma cotação recebida por segundo; pelo menos 40 observações e 60s de cobertura sem lacuna maior que 3s; R-quadrado de tendência >=0,70, reaproveitando o limite direcional já existente no detector de lateralização. Retração material: movimento de 6s contrário à tendência maior que duas vezes a mudança absoluta mediana observada, usando a escala de dois movimentos já existente no detector de swings.

Somente um sinal que segue essa tendência seria retido enquanto a retração ainda a contraria. Não há inversão, temporizador, admissão nova ou mudança nas decisões contra a tendência, laterais ou sem contexto suficiente. A triagem exigia remover mais perdas que acertos em cada um dos três conjuntos conhecidos antes de executar replay completo ou consultar os dados novos registrados.

| Conjunto conhecido | Sinais originais retidos na triagem | Acertos removidos | Perdas removidas |
|---|---:|---:|---:|
| Forex | 4 | 2 | 2 |
| Cripto de 15–17/10/2025 | 18 | 11 | 7 |
| Cripto de 18–20/10/2025 | 15 | 4 | 11 |
| Vídeo | 0 | 0 | 0 |

A hipótese falhou na própria triagem. Esses números são contrafactuais nos sinais originais, não desempenho de um runtime que mudou seus horários de admissão. Nenhum resultado artificial de “taxa melhor após filtrar perdas” foi declarado. A validação registrada para 21–23/10/2025 não foi consultada, pois a condição de avanço falhou. A regra permanece um módulo de experimento sem ligação com o produto.

## Alvo do Digital: fato do código e hipótese a confirmar

O código do modo atual agenda `exitAt = now + duração manual` e conta acerto comparando a cotação de vencimento com a cotação da entrada. O resultado declara explicitamente sua fonte como preço observado, não liquidação. `brokerDurationGuard` não considera um horário fixo como duração verificada. A projeção usa o horizonte manual e a saída do clique local não confirma o contrato efetivamente comprado.

A documentação oficial da IQ Option descreve o preço de exercício como o nível que o preço deve superar ao vencer e explica que a posição encerra no horário selecionado. Fonte: https://blog.iqoption.com/pt/como-negociar-opcoes-digitais-uma-versao-avancada-das-opcoes-binarias/ (consultada em 18/10/2026). Isso não confirma as configurações do usuário nem foi extrapolado como uma especificação verificada da Exnova.

Quatro testes controlados demonstram o limite da comparação atual:

1. CALL com referência de preço 100 e cotação 100,20 após 30s é um acerto direcional; um contrato hipotético com strike 100,30 perderia nesse mesmo vencimento.
2. Cotação 100,20 em +30s e 99,80 em +60s dá um acerto no horizonte de 30s, mas perda num contrato hipotético que vence em +60s com referência 100.
3. Se referência e vencimento coincidirem, o exemplo controlado concorda.
4. Metadado de horário fixo não é tratado pelo guard como duração selecionada, como definido no código publicado.

Esses exemplos não são operações capturadas do usuário e **não demonstram que esta é a causa das perdas atuais**. Também não explicam por si só os resultados fracos dos replays externos. Eles demonstram que uma melhoria de direção aos 30s não equivale automaticamente a uma melhoria de contratos Digital. Antes de implementar uma mudança específica para Digital é necessário esclarecer se a operação atual vence 30s depois do clique ou no horário fixo da corretora; depois, conferir sua referência de preço real.

## Verificação e reprodução

Nove testes passaram: cinco do qualificador de retração, incluindo simetria, causalidade e preservação de outros sinais, e quatro da auditoria de referência de contrato. Os testes não enviam ordens e não acessam a corretora.

- `node scripts/sentinel-entry-path-diagnostic-20261018.mjs`
- `node scripts/sentinel-trend-pullback-screen-20261018.mjs`
- `node --test tests/sentinel-trend-pullback-entry-20261018.test.mjs tests/sentinel-digital-contract-reference-audit-20261018.test.mjs`

Brutos preservados em `.json.gz`; resumo legível por máquina em `sentinel-entry-target-investigation-summary-20261018.json`. As fontes e fixtures são as mesmas da pesquisa anterior. Não foi coletado ou publicado histórico pessoal novo da corretora.
