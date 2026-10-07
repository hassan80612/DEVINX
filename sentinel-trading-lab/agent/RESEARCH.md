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
