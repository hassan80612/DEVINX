# Sentinel 13.9.56 — auditoria somente leitura das etapas 5 e 6

Data: 19/10/2026. Código auditado: versão publicada 13.9.56, commit `ad23054fdcae1098835f56c15a9528f0ef97e28a`. Teste: `scripts/sentinel-13956-stage5-6-readonly-audit.mjs`, workflow GitHub Actions `sentinel-13956-stage5-6-forensic.yml`. Nenhuma alteração ou publicação do programa, do bot ou do Martingale.

## Etapa 5 — escolha da reação histórica

Arquivo: `sentinel-trading-lab/agent/src/core/candle-level-map.mjs`, `assessCandleLevelRoute`.

O cálculo monta eventos de rejeição/rompimento de níveis `levels` com os preços reais observados e define `candleBacked` quando há pivô confirmado e evidência adicional. **Mas escolhe o evento mais PRÓXIMO primeiro** com:

```js
events.sort((a,b)=>a.distance-b.distance||Number(b.candleBacked)-Number(a.candleBacked));
route.event=events[0]??null;
```

Depois, `applyCandleLevelRoute` apenas autoriza que uma reação substitua a decisão se **o evento escolhido** for `candleBacked`. Assim, uma rejeição perto do preço mas **não confirmada** pode ocupar o primeiro lugar e **esconder outra reação confirmada de mesmo lado**.

**Reprodução:** mesmo preço, 13 quotes em 12 segundos; dois níveis de resistência relevantes e um PUT confirmado. Com ambos os níveis, o nível mais próximo não respaldado foi escolhido e o sinal CALL anterior continuou; com apenas o nível confirmado, a mesma entrada virou PUT por `multiscale-candle-rejection`.

Este resultado mostra falha real de prioridade lógica *no cenário controlado*. Não sabemos com que frequência essas duas zonas aparecem no feed OTC real, nem quantas perdas são causadas por ela.

Além disso, a etapa 5 só recebe `candles` quando o feed histórico passa a verificação: `runtime.mjs` usa `snap.historicalCandlesVerified===false?[]:(snap.candles||[])`. Se essa validação falhar, a camada histórica é omitida. **Não afirmar que isso está acontecendo na sessão do usuário** sem registrar os snapshots.

## Etapa 6 — a operação avaliada e a operação realmente executada podem diferir

`runtime.mjs` registra `vnextWindowOutcomes` usando a **cotação na chamada** (preço `next.entryPrice`) e a expiração de `next.exitAt=now+durationMs`. Este histórico é explicitamente de **cotações**, não de liquidação real de operações.

O `signal-executor.mjs` admite um sinal ainda recente por até 1500 ms (`now-queued.at>1500` descarta). O pedido para o navegador e a cotação próxima do clique são registrados mais tarde, pelo `order.captureEntry`. A cotação próxima do clique tampouco comprova necessariamente qual foi o preço final de execução que a corretora aceitou.

**Reprodução matemática:** CALL emitido em 1,00000; corretora hipoteticamente executa em 1,00040 depois de 1 segundo; preço futuro 1,00020. Comparação analítica pelo preço inicial: ganha; comparação pela entrada realmente executada: perde. Se a corretora define os 30 segundos a partir do clique, a hora real do vencimento também pode diferir.

O lifecycle da etapa 6 trava a direção de um sinal `fired` até `exitAt` e espera cotação fresca depois do vencimento para a próxima entrada. Isto foi confirmado no teste, mas não comprova sincronia exata de preço nem de vencimento com a corretora.

**Consequência:** comparar somente `outcomeQuality.correct` com perdas do bot pode causar aparente contradição; as referências não são necessariamente idênticas. Precisamos correlacionar `signalId`, preço e hora do sinal, hora e preço de ordem aceitos pela corretora e hora/preço de liquidação **sem fabricar cotações**. Nenhum log real desse conjunto foi usado nesta auditoria.

## Prioridades para a próxima mudança (ainda NÃO implementadas)

1. Na etapa 5, selecionar as rejeições **respaldadas por velas fechadas** antes de rejeições próximas mas não confirmadas; verificar que o histórico foi validado, que não existe conflito e que a reação atual é recente. Não impor PUT apenas pela presença de resistência.
2. Na etapa 6, separar contagem de **assertividade dos sinais no instante indicado** da contagem de **resultados executados pela corretora**, com pares reais de preços e horários de entrada/saída. Sem ordens aceitas e encerradas, informar `não verificável`, jamais classificar como vitória operacional.
3. Medir ambas em amostras independentes, não usar a gravação antiga duas vezes como prova de melhora.

## Pedido de Martingale para alteração futura

Usuário solicitou, para a **PRÓXIMA correção**, limite máximo de **3 níveis/vezes** de Martingale, **NÃO agora**. Nenhum parâmetro de Martingale foi alterado nesta auditoria. Esclarecer se "3 vezes" significa 3 progressões além da entrada normal antes de mudar.

## Limitações

A execução GitHub Actions foi bem-sucedida, com os testes regressivos existentes aprovados. O teste é sintético e não contém dados de lucro/perda da conta real. Não comprova melhoria estatística na direção CALL/PUT.
