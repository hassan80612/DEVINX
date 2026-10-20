# Sentinel 13.9.59 candidato — integridade de decisão, evidência e segurança de perdas

> Estado: **somente branch isolada**, versão pública ainda **13.9.58**.
> A sessão relatada com banca de US$ 30 foi perdida, mas não há aqui um extrato completo dos seus cliques, preços, resultados e timestamps. Este estudo NÃO atribui causa comprovada a essas operações.

## Mudanças mantidas em código

1. O modo manual de estratégia para **30 segundos** agora usa a evidência de seu especialista (`trend`, `mean_reversion`, `fibonacci_retest`, etc.), em vez de usar automaticamente o sinal da base genérica. Suporte/resistência pode liberar uma rejeição observada em velas históricas mesmo com poucos segundos de cotações recentes. Outros prazos continuam na política anterior.
2. A adaptação entre projeções de ciclos de 30 segundos usa **intervalos não sobrepostos**, de modo que seis sinais iniciados a cada 5s não representem seis resultados independentes de 30s. A janela já enviada mantém lado e vencimento.
3. O executor ganha o parâmetro opcional `maxConsecutiveLosses` (0–50): só conta sequências completas, com resultado líquido da corretora confirmado. Lucro zera a contagem, empate mantém, sequência incompleta não incrementa. `0` mantém o comportamento contínuo; o usuário controla o limite. O teto de níveis de martingale permanece independente.
4. PC e celular exibem o novo limite, a contagem e alerta quando o stop-loss é zero ou maior/igual ao saldo recebido. Não são alterados automaticamente os limites financeiros.

## Hipótese testada e rejeitada

A ideia de bloquear todo sinal cujo ciclo matemático contrariasse a última estrutura confirmada **foi rejeitada**. O replay comparado nos mesmos instantes de uma gravação de 16/10 apresentou 5 acertos e 7 erros, contra 11 acertos e 3 erros da 13.9.58 publicada, com um encerramento sem cotação verificável. A proibição geral de CALL/PUT contra a tendência **NÃO** permanece no código candidato. Resta apenas um metadado observacional do conflito.

A comparação usa preço de referência da cotação emitida, não a ordem física de corretora. Não equivale a resultado financeiro executado e não permite declarar taxa de acerto futura.

## Ablation exata: 13.9.58 publicada e 13.9.59 experimental

Módulos da 13.9.58 obtidos do commit `8b2ccd0374014b977c1ed240a0828359c30684fe`. Entradas e vencimentos avaliados no mesmo replay, sem preços futuros alimentando a decisão:

| Fonte / cenário | Acertos | Erros | Empates | Indefinidos | Assertividade nos não empatados |
| --- | ---: | ---: | ---: | ---: | ---: |
| Vídeo 6 casas, 13.9.58 publicada | 11 | 3 | 0 | 1 | 78,6% |
| Vídeo 6 casas, 13.9.58 com aprendizado não sobreposto | 11 | 3 | 0 | 1 | 78,6% |
| Vídeo 6 casas, candidato com veto de tendência **rejeitado** | 5 | 7 | 1 | 1 | 41,7% |
| Vídeo 5 casas, 13.9.58 publicada | 10 | 3 | 0 | 1 | 76,9% |
| Vídeo 5 casas, 13.9.58 com aprendizado não sobreposto | 10 | 3 | 0 | 1 | 76,9% |
| Vídeo 5 casas, candidato com veto **rejeitado** | 7 | 5 | 1 | 1 | 58,3% |

Ambas as extrações vêm da mesma gravação, **não são duas amostras independentes**. Mudanças pontuais podem melhorar ou piorar em outras janelas; não foi calibrado um limiar com base no vídeo para forçar vitória.

## Critérios antes de publicar

- Todos os testes de regressão e compilação do Agent/Web passam.
- Replay pós-rejeição do veto não regride na gravação conhecida.
- Para demonstrar ganho real e diagnosticar a sequência que quebrou a banca, ainda faltam os **timestamps, entradas executadas, ativo, direção, valor, payout, expiração e resultado de cada ordem** na sessão perdida. Logs de mercado e operações dos mesmos instantes permitirão replay sem inventar cotações.
- Não colocar dinheiro real com base apenas nesses testes.

## Reprodução

```bash
git fetch --no-tags --depth=1 origin 8b2ccd0374014b977c1ed240a0828359c30684fe
node research/sentinel-13959-decision-ablation.mjs
node --test tests/sentinel-13959-decision-integrity-risk.test.mjs
```
