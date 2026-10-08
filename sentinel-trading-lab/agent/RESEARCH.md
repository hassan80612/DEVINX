# Sentinel 13.4.0 — cenário e pesquisa

A revisão de contexto seleciona continuação, rompimento e reversão, com contribuições diferentes das estratégias. Ela é avaliada como candidata em paralelo e só substitui a previsão de controle após cumprir os mesmos critérios de comparação prospectiva. A entrada exige cotações independentes sustentando o gatilho. Candidato de reversão não remove a proteção contra força contrária. Encerramento da oportunidade de entrada é diferente do cancelamento do cenário.

O histórico de mercado é gravado automaticamente quando o feed está validado em `worker/data/market-history`. O registro contém apenas preços, checkpoints de candles, parâmetros de análise e decisões; não contém saldo, credenciais ou comandos de ordens. Limites: sete dias ou 256 MiB, em segmentos de 16 MiB. Erros e descarte de eventos aparecem em `marketJournal` no status remoto. A gravação não bloqueia a avaliação do motor.

Para reproduzir arquivos em ordem cronológica:

```sh
node worker/replay.mjs worker/data/market-history/ARQUIVO-1.jsonl worker/data/market-history/ARQUIVO-2.jsonl
```

A reprodução não executa ordens. Compara resultados de sinais com demoras de 0, 1 e 2 segundos. Preserva o prazo contado a partir do preço simulado de entrada; conta ausência de cotação, entrada não preenchida e sinais pendentes. Não usa cotações futuras para construir a análise do presente. Resultados de forecasts bloqueados são reportados separadamente; não são oportunidades garantidas.

O modelo estatístico usa aprendizado logístico incremental por ativo e prazo, com previsão registrada antes do resultado e amostras sem sobreposição no mesmo prazo. Começa em `shadow`: acompanha resultados sem mudar o sinal. A contribuição de 20% só se torna disponível após pelo menos 120 resultados avaliados, três sessões e vantagem no erro quadrático de probabilidade com limite inferior positivo. Essa comparação progressiva não substitui revisão de um histórico amplo, estabilidade entre regimes ou prova de rentabilidade. Os resultados empatados não treinam o modelo. Dados sem cotação suficiente ficam sem resultado, sem vitória fabricada.

GET `/research` do worker retorna resumo, situação da gravação e últimos resultados. É uma inspeção sujeita ao acesso existente do agente.

Porcentagens continuam sendo estimativas. A nova época de calibração não reaproveita resultados do motor anterior como se fossem resultados da revisão. O diário registra sinais liberados e invalidados; o cancelamento não elimina o resultado na expiração.

Candles construídos de cotações identificam seu volume como `quote-count`. Isso não é volume negociado. Não foram acrescentados livro de ofertas, delta de agressão, VWAP por volume real ou mapa de liquidez, pois esses dados não foram confirmados no feed.

Validação de software: casos de primeiro toque, sustentação, candidato sem virada, cancelamento com cotação repetida, buckets de prazo, especialização das estratégias, separação temporal de aprendizado, gravação e replay; testes de regressão; executável e renderização Windows. Esses testes verificam comportamento, não taxa de acerto do mercado.


## 13.4.3 — tipo do cenário e reversão independente

O tipo de entrada é scenario.kind do planner no prazo da operação: continuação/rompimento usam rompimento sustentado; reversão usa toque e reação confirmada. A descrição geral das técnicas não classifica o cenário. Em planos antigos sem o campo, só a regra específica serve de compatibilidade.

Uma candidatura oposta é avaliada separadamente enquanto o cenário original continua. Só substitui o cenário com previsão e expiração alinhadas, filtros existentes, confirmação estrutural e gatilho sustentado em cotações independentes. Cancelar não libera automaticamente o contrário. Um toque recente real, até cinco segundos antes, pode fundamentar uma reação já iniciada; cotações futuras e regiões rompidas não são reutilizadas. O resultado anterior permanece registrado e o novo sinal tem sua própria referência, prazo e oportunidade única. Amostras prospectivas de forecast continuam sem sobreposição; resultados operacionais podem registrar cenários opostos sobrepostos e não são amostras independentes de validação estatística.

O reconhecimento nativo do campo de investimento também aceita um número clicável dentro do painel de investimento da corretora, inclusive componentes fechados, excluindo saldo, payout, expiração e controles Sentinel. Essa apresentação pode abrir o editor real; a execução precisa localizar o editor e confirmar o valor após a alteração antes de clicar na direção. A inspeção não clica nem envia ordens. O teste em tela simulada não comprova a execução na conta real do usuário.


## 13.4.4 — confirmed entry timing

Control forecasts retain their weights, thresholds and structural triggers. Earlier local-bar timing remains in the research candidate: a chronological single-session replay of 3314 frames worsened results (control 3 wins/6 losses/1 unsettled; earlier timing 1 win/9 losses), so it was not promoted. These small samples do not establish future accuracy. Sparse or stale bars retain structural levels. The candidate forming setup can adopt its first confirmed closer continuation level once, preserving the original scenario deadline and invalidation.

Operational entry is suspended for a confirmed opposing short turn even while the 15s trend still favors the old direction, or when weakening movement begins to retrace. Quotes staying above/below a trigger while moving the wrong way cannot confirm continuation entry. The candidate-only volatility/local-bar distance cap also stays in research: it removed winning control entries in the same small replay (0 wins/4 losses when activated alone with the force fixes). No production promotion of this cap. Released opportunities keep the existing 3.5s maximum. After loss of strength, a new same-direction opportunity requires a new closed local bar and independent sustained quotes; it preserves the original scenario deadline and previous outcome. No timer simply renews an entry.

The worker synchronizes the current broker snapshot before each event evaluation and immediately updates the overlay on changes to entry permission/state. Continuous values keep their regular throttle. Tests exercise CALL and PUT, delayed points, force loss, independent recovery and a chronological real-price frame. These changes address timing defects, not a demonstrated increase in predictive accuracy. No orders are executed by the tests or investigation.


## 13.4.5 — current entry permission and independent opposite continuation

Operational thresholds use the current calibrated probabilities rather than the presentation EMA; the scenario card shows these same current numbers. Price sustain, independent quote timestamps, both horizons, configured confidence, structure and opposing-force guards remain mandatory. Software tests show release at the first fully qualified evaluation even if display smoothing still favors the previous side, and no release when only smoothed values meet the threshold. This is not an instruction to enter on every directional preview.

An active setup can be replaced by an independently qualified opposite continuation/breakout with aligned 5s/15s flow and sustained price trigger, without requiring it to retain a momentary reversal label. Confirmed structural reactions retain their independent path. Prior outcomes survive the transition. The current analysis side is visible even while the old operational setup awaits confirmation; analysis countdown and the maximum 3.5s entry burst are distinct.

Chronological replay: 3314 frames from one asset/session; unchanged control and current-probability revision both yielded 4 wins, 5 losses and 1 unsettled. A broader earlier continuation prototype yielded 5 wins, 7 losses and 1 unsettled, so it was not promoted. This small sample does not establish predictive accuracy or reproduce the user's manual trades. Local-bar anticipation and its distance cap remain in research.


## 13.4.6 — stable scenario status during live forecast changes

The user's 29.8s recording on13.4.5 showed a cancelled PUT changing color with fresh CALL previews, and active direction labels changing on forecasts with46–54 confidence points below the configured55-point filter. No entry release appeared in that recording. Terminal scenarios now retain their own direction/color/reason; active display follows the operational setup unless the engine has a separately qualified opposite opportunity. Below-filter live forecasts do not take over the main direction label. Current metrics remain visible. Actual entry permission still comes directly from the engine, without a new presentation delay or a new forecast filter.

Tests cover the recorded confidence sequence, stable cancellation colors, strong independent opposite preview, immediate opposite entry permission, and outcome/deadline preservation. Runtime strategy and trigger logic are unchanged in this revision. This display correction does not demonstrate improved prediction quality.

## 13.4.8 — independent execution horizon timing

A confirmed structural opportunity at the selected order expiry can qualify without matching the longer scenario: continuation/breakout requires short structure, flow, room and aligned 5s/15s deltas; reversal retains its confirmed touch/reaction requirements. Existing execution direction, confidence, probability, safety, history and independent price confirmations still apply. The ordinary aligned path and fixed 3.5s entry burst remain intact. Independent opportunities use a separate validation strategy key, preserving previous outcomes. The card shows the forecast and metrics that authorized the actual entry and labels its horizon. Waiting explains the failing execution criterion.

Chronological replay of 3,314 actual quote frames retained all ten baseline signals at the same timestamps (4 wins, 5 losses, 1 unavailable settlement). This sample contains no newly qualified independent-horizon entries and therefore establishes no accuracy or profitability improvement. The unrestricted expiry-only prototype removed a baseline winner and was rejected; broader early local-bar triggers remain research-only. Symmetric synthetic regressions cover first eligible CALL/PUT frames and reversal while the longer scenario stays opposite, including forbidden safety/weakening/missing-structure cases.


## 13.4.8 — repeated price rejection entry timing

An independent quote-derived support/resistance event requires separated tests, a meaningful intervening swing, its neckline break, two advancing real quotes, an intact invalidation and room before the opposite barrier. The price event can supply its own trigger to an already qualified expiration forecast, including a fresh opposite opportunity or a new event after cancellation. It never manufactures confidence, probability or forecast direction. Ordinary forecasts, strategy weights, safety and history thresholds remain unchanged. Events expire after ten seconds from confirmation; entry bursts remain fixed at 3.5 seconds and previous results are preserved. Repeated-rejection entries have a distinct validation key. Future, duplicate and pre-break quote evidence cannot authorize entry.

Twelve new symmetric tests verify first eligible release, reversal and cancellation recovery, original forecast quality requirements, price evidence, space, gaps and separate history blocking. A chronological replay of 3,314 recorded quotes retained the same ten signals (4 wins, 5 losses, 1 without nearby settlement quote); no newly qualified neckline event occurred in that sample. A second 389-quote sample had no qualified reaction or entry. These samples do not demonstrate an improvement in prediction accuracy. A broader approach promoting micro-rejections was rejected after it increased losing entries. No trades or account/risk changes were made.


## 13.4.9 — scenario coordinator and independent entry analyst

A main scenario owns its side, structural invalidation and original deadline. The entry analyst reads the order expiry separately. A contrary entry requires a confirmed reversal, aligned flow, structure, room and fresh prices. A forming forecast cannot create a pending trade outcome. Exceeded points close the opportunity; one release consumes it, without a second release or timer extension. The overlay shows `CENÁRIO PUT` and `ENTRAR AGORA · CALL` separately.

Quote bursts are coalesced at 200 ms with a trailing evaluation, including quotes received while the worker is busy. The default analysis interval is 400 ms. Price confirmation still requires independent progressing quotes; faster evaluation does not bypass this confirmation or broker controls.

EntryResearch records only released opportunities, freezes probabilities before future price labels, and learns online in shadow mode. Keys separate provider, asset, expiry, entry type, side, regime and strategy combination. Missing expiry prices are unresolved, not wins/losses. This is a quote-based forward evaluation, not a broker-confirmed order ledger. A learned model needs 120 outcomes, three dates, at least 83.3% observed wins and positive paired Brier improvement before it can filter entries. Target achieved is reported separately and requires the Wilson lower bound to reach 83.3%. The generic operational history filter now uses the 83.3% entry target rather than a 60% default.

Existing low-level timing regressions exercise `_entryTimingState`, which the coordinator calls. New coordinator tests cover a PUT scenario with CALL reversal, consumption, late points, structure failure, provider isolation, missing labels, persistent learner data and trailing quote evaluation. Software tests verify these rules; they do not prove trading profitability. The current recorded session is too small and sparse to establish the requested 10-win/2-loss reliability.


## 13.4.10 — independent local opportunities

The open scenario is a permission window. EntryOpportunities evaluates CALL and PUT using local flow, structure, room, continuation/breakout setups and confirmed reversals. It does not require the expiry forecast or future strategy votes to change sides first. Reversal flow uses the current reaction and does not require 15s momentum to have already changed. The configurable technical point filter still applies; forecasting percentages remain separate from this entry score.

Price timing uses the previous closed 5s bar for continuation/breakout and the first recovery quote after a local extreme for reversal, with structural invalidation, maximum entry distance and two fresh independent price confirmations. An updated closed local bar may replace an untriggered local point; it cannot extend the parent scenario or produce a duplicate release. A new valid scenario may open immediately after structural invalidation, before the old deadline. Broken levels cannot resurrect unchanged.

Entry validation keys isolate the new local policy. Frozen baseline probabilities still come from the original expiry forecast, not the technical entry score. UI permission follows the independent operational signal, including when that old forecast still points the other way. Existing provider, asset, expiry, consumption and installer isolation remain covered. This release does not establish the requested trading win rate.
