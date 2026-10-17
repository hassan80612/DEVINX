# Análise do Sentinel 13.9.31 — 17/10/2026

## Conclusão

O problema de direção não foi eliminado. O motor publicado ainda pode projetar continuação onde ocorre reversão, ou reversão onde ocorre continuação. Uma espera fixa não melhorou o replay disponível. A leitura de 100 velas existe, mas não corresponde integralmente à comparação das estruturas de 3, 10, 20, 50 e 100 velas solicitada pelo usuário.

Foi reproduzido e corrigido, em uma cópia de trabalho, um defeito concreto de integração: suporte e resistência eram confrontados com a projeção estreita original, mesmo quando o seletor já havia escolhido outra projeção. A correção passou nos testes descritos abaixo. **Ela não foi publicada e não comprova aumento de assertividade no mercado.** Nenhuma espera foi adicionada ao produto.

## Material e método

- Produção verificada: 13.9.31, commit `e2270fc629cc71e9ef8d07bb5a1268b071888bc4`.
- Vídeo: `1001267096.mp4`, 9min14,8s; SHA-256 `ccbe82f83d194e1d116745a10781a7c41dacaa2447c20bf03a2fa7f3ba9b71a4`.
- Instrumento observado: EUR/GBP OTC, horizonte de 30 segundos.
- Amostra principal: 1.065 preços lidos do gráfico, até duas observações por segundo, seis casas decimais. Uma segunda extração do mesmo vídeo tem 542 preços e cinco casas decimais.
- O vídeo foi gravado em uma versão anterior. O teste reproduz o motor atual sobre os preços observados; não afirma que a gravação já utilizava a 31.
- Cada decisão recebe somente as observações disponíveis até aquele instante. A seleção adaptativa usa somente resultados já vencidos. O replay reproduziu exatamente os instantes e lados emitidos pelo caminho real de validação do runtime, nas duas extrações.
- Cada sinal tem 30 segundos a partir da própria emissão. Não há mudança de lado durante uma operação nem reutilização de um vencimento antigo.

As 100 velas anteriores recebidas pelo Agent não estão registradas nesse vídeo. Assim, este replay avalia a base de decisão e o seletor de vencimento sem reconstruir artificialmente esse contexto. O defeito envolvendo níveis históricos foi verificado separadamente, em cenários controlados.

Os preços extraídos de texto comprimido têm arredondamento, lacunas e incerteza no horário de aproximadamente um segundo. Não são ticks originais nem comprovantes de liquidação da corretora. As duas extrações pertencem à mesma gravação e não são duas amostras independentes.

## Resultados da espera

Foi exigida permanência contínua da mesma decisão válida antes de emitir. Uma decisão contrária, falta de prontidão ou lacuna reinicia essa confirmação. Durante uma operação aberta, a análise continua em segundo plano. O prazo de 30 segundos começa na nova emissão.

| Confirmação exigida | Acertos | Erros | Empates | Sem vencimento no vídeo | Acertos entre resultados definidos |
|---|---:|---:|---:|---:|---:|
| Nenhuma | 10 | 4 | 0 | 1 | 71,4% |
| 0,5 segundo | 5 | 7 | 1 | 1 | 41,7% |
| 1 segundo | 6 | 5 | 0 | 1 | 54,5% |
| 2 segundos | 6 | 4 | 0 | 1 | 60,0% |
| 3 segundos | 4 | 5 | 0 | 1 | 44,4% |
| 5 segundos | 4 | 3 | 0 | 1 | 57,1% |

Também foi testado iniciar a confirmação somente após a operação anterior vencer. Nenhuma duração superou a taxa principal sem espera. Isso não prova que qualquer confirmação seja inútil; mostra que esses atrasos fixos não resolveram os erros desta gravação.

Na extração com menor precisão, a base teve 10 acertos, 3 erros e um vencimento ausente. Essa diferença demonstra sensibilidade à observação dos preços. Acrescentar um segundo entre sinal e execução também alterou o resultado da amostra principal para 9 acertos e 5 erros. Portanto, 71,4% não é uma taxa de produção comprovada, nem uma promessa de resultado futuro. Há somente 14 resultados definidos no teste principal.

Os 12 sinais efetivamente visíveis da versão antiga tiveram, pelos preços observados, 7 acertos, 4 erros e um empate. Os sinais do replay atual ocorrem em outros instantes. A comparação não isola um ganho causal entre versões.

## Onde ocorreram os erros reproduzidos

Horários aproximados de Brasília. Estes são sinais do replay, e não uma transcrição dos cartões antigos.

| Entrada | Direção | Preço observado na entrada | Após 30 segundos | Diagnóstico |
|---|---|---:|---:|---|
| 13:50:50,0 | CALL | 0,843185 | 0,843175 | Entrada no máximo dos 30 segundos anteriores. A projeção estreita indicava CALL; a ampla indicava PUT. O preço ainda subiu inicialmente e depois terminou abaixo. |
| 13:51:53,5 | CALL | 0,843305 | 0,843255 | As duas projeções indicavam CALL. Houve alta inicial, seguida de fechamento abaixo. Esperar apenas um primeiro movimento favorável não separa esse erro de uma boa entrada. |
| 13:56:13,5 | PUT | 0,842985 | 0,843085 | As duas projeções indicavam PUT apesar de movimentos positivos nos 3, 6 e 10 segundos anteriores. A recuperação continuou. |
| 13:56:44,5 | PUT | 0,843105 | 0,843155 | As duas projeções indicavam PUT em uma trajetória recente de recuperação. O movimento inicial foi favorável ao PUT, mas o preço terminou acima. |

A posição no intervalo dos últimos 30 segundos ajuda a localizar cada caso; ela não comprova uma resistência ou um suporte de 50 ou 100 velas. Inverter todos os sinais produziria 4 acertos e 10 erros nesta amostra. O defeito não é uma inversão global de CALL e PUT.

## O que a leitura das velas faz hoje — e o que falta

| Componente | Comportamento encontrado | Lacuna relevante |
|---|---|---|
| Contexto histórico | Retém até 100 velas fechadas recebidas, do mesmo período; agrupa máximas e mínimas por proximidade. | Não produz e compara explicitamente os estados das janelas de 3, 10, 20, 50 e 100 velas. |
| Toques e pivôs | Usa extremos locais e quantidade de velas que compartilham uma região. | Velas consecutivas podem aumentar a contagem de toques sem um afastamento e novo teste independentes. Isso não equivale necessariamente a uma barreira forte. |
| Corpo e pavios | Máximas e mínimas formam as regiões; fechamentos alimentam médias. | A reação atual não classifica explicitamente proporção de corpo/pavio, posição de fechamento, compressão de vários testes e expansão da vela de rompimento. |
| Histórico curto | Sem uma média de 20 períodos, a camada histórica não intervém. | Um topo ou fundo recente de 3 ou 10 velas pode existir e deixar de influenciar essa camada quando o histórico disponível é curto. A base continua funcionando. |
| Rejeição e rompimento | A decisão histórica considera aproximadamente 2, 6 e 12 segundos de preços recentes. Um toque isolado não implica reversão. | Não há acompanhamento explícito de toda a sequência aproximação → testes → rompimento → reteste → rompimento fracassado. |
| Projeção de 30 segundos | Ajusta tendência e oscilação aos preços passados; o seletor compara resultados já vencidos. | Um ajuste bom ao passado pode prever o lado errado depois de uma mudança de regime. A previsão pode contrariar o fluxo atual, como no PUT das 13:56:13,5. |
| Conflito de fontes | A versão publicada compara a reação histórica com a projeção estreita original. | Quando a ampla é escolhida, a conferência pode aceitar uma reação contrária à decisão escolhida ou bloquear uma reação que concorda com ela. Defeito corrigido na cópia de trabalho. |

O requisito do usuário é uma comparação entre contexto distante e formação próxima. Uma região antiga deve continuar disponível; a formação recente precisa informar se há rejeição, aproximação sem confirmação, pressão de rompimento ou sustentação do preço além da região. Isso exige coerência entre as janelas, sem transformar qualquer toque em reversão e sem obrigar qualquer vela forte a significar continuação.

As velas registram a trajetória observada do preço. Sua forma e sequência oferecem contexto que o agrupamento atual usa parcialmente. Elas não revelam a próxima vela antecipadamente. Nesta análise não foi atribuída uma probabilidade de 84% ou 90% a esses padrões.

## Correção concreta preparada

Arquivo: `sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs`.

A camada histórica agora recebe a projeção efetivamente escolhida quando ela está pronta. A projeção estreita permanece como referência quando ainda não existe uma decisão admitida. Isso preserva a possibilidade de uma reação histórica autorizar uma entrada antes de a estrutura curta estar pronta, dentro das regras existentes.

Dois testes reproduzem os dois lados do defeito com preços extraídos do vídeo e contexto histórico controlado:

1. A projeção ampla escolhe PUT; uma rejeição para CALL concorda apenas com a projeção estreita descartada. Antes, era aceita. Depois, o conflito é reconhecido.
2. A projeção ampla escolhe PUT; a rejeição histórica também indica PUT. Antes, era bloqueada pela projeção estreita CALL. Depois, pode ser emitida pelas regras já existentes.

As zonas e o estado do seletor nesses testes são controlados, não recuperados da sessão original. Eles comprovam a incoerência e sua correção, sem atribuir a esse defeito uma perda específica do usuário. O replay sem histórico mantém os mesmos resultados antes e depois dessa alteração; ele não serve para medir o ganho dessa correção.

Foram aprovados 30 testes: 12 da estrutura histórica, 5 do seletor adaptativo, 9 do ciclo único e 4 novos testes de integração e causalidade da auditoria. Nenhum teste enviou ordens. A correção não altera contador, instalador ou relógio e não adiciona tempo de espera.

## Demora e próximos critérios de validação

Não foi encontrado um temporizador fixo de três minutos nesse caminho. No replay principal, o primeiro sinal ocorre 43,5 segundos após o início dos preços disponíveis. Depois disso, o maior intervalo de análise sem operação entre sinais foi de 33,5 segundos. A espera observada decorre de critérios de estrutura e prontidão, e não de um cálculo que leva minutos: cada avaliação levou poucos milissegundos nesta máquina. Isso não mede o computador, a rede ou a disponibilidade de velas na sessão do usuário.

A melhoria estrutural restante deve ser avaliada por resultados separados para continuação, rejeição, rompimento e falso rompimento; com janelas locais e históricas explícitas e registros das velas realmente disponíveis em cada emissão. É necessário avaliar novas sessões e a sensibilidade ao atraso real de execução. Reutilizar repetidamente estes nove minutos para escolher parâmetros tende a ajustar o motor ao vídeo.

**Estado final:** análise concluída, defeito de integração corrigido e testado na cópia de trabalho, produção ainda na 13.9.31. A leitura completa entre várias escalas de velas e uma assertividade maior continuam sem comprovação. Não foi lançado um motor experimental como se o problema inteiro estivesse resolvido.

## Reprodução

```sh
node scripts/sentinel-13931-audit.mjs
node --experimental-strip-types --test tests/sentinel-13931-historical-structure.test.mjs tests/sentinel-13929-adaptive-expiry.test.mjs tests/sentinel-now-expiry-one-shot.test.mjs tests/sentinel-13931-selected-forecast-structure.test.mjs tests/sentinel-13931-audit-causality.test.mjs
```

Os dados completos, incluindo sinais individuais, políticas alternativas e limitações, estão em `sentinel-13931-complete-audit-20261017.json`. O campo `admissionWaitMs` mede há quanto tempo a decisão permanece estável; durante uma operação aberta ele pode crescer sem representar atraso adicional imposto à entrada seguinte.
