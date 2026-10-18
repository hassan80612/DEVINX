# Assertividade: dois candidatos descartados — 18/10/2026

**Não houve melhoria confiável. Nenhuma regra de previsão foi publicada ou alterada em produção.** Base: Sentinel 13.9.37, commit `21f43a9587e2a4f6cdb23933226b4b0f0520e466`.

| Candidato | Comparação | Atual | Candidata | Decisão |
|---|---|---:|---:|---|
| Padrões comparáveis com resultados não sobrepostos | 3 janelas externas conhecidas | 70/150 = 46,67% | 71/146 = 48,63% | Rejeitado: piorou o vídeo conhecido |
| Mesmo candidato | Vídeo extraído conhecido | 11/14 = 78,57% | 2/7 = 28,57% | Menos sinais, pior resultado e maior espera |
| Espaço até o próximo nível contrário | 3 janelas externas conhecidas | 70/150 = 46,67% | 63/126 = 50,00% | Resultado preliminar insuficiente |
| Mesmo candidato | 3 blocos horários reservados antes do teste | 37/70 = 52,86% | 26/61 = 42,62% | Rejeitado: regressão em 2 blocos, 1 igual |

Os denominadores contam somente acertos e erros. Empates e vencimentos sem preço estão separados no JSON. A comparação é de replays completos: cada mudança pode alterar a hora das entradas seguintes. Não se trata de apagar retrospectivamente perdas dos mesmos sinais.

## Hipóteses testadas

1. O aprendiz usava exemplos a cada 4 segundos para resultados de 30 segundos, com muita sobreposição. O candidato manteve as mesmas características, janela de 180 segundos, pesos e limite de força, mas selecionou exemplos comparáveis cujos intervalos de resultado não se sobrepõem. Exigiu três exemplos distintos; quando ausentes, retornou imediatamente à leitura estrutural existente. Apesar da motivação matemática, prejudicou um trecho que a base acertava.
2. As rejeições históricas e de velas podiam liberar entrada perto de outro nível contrário. O candidato comparou o espaço disponível com a mediana dos movimentos absolutos de seis blocos de 30 segundos já concluídos, sem aumentar histórico ou criar temporizador. Preservou outros caminhos de admissão e o sinal imutável durante o vencimento. Melhorou o agregado inicial, mas falhou na validação reservada.

Os horários reservados foram definidos antes do cálculo dos resultados: EUR/USD em 30/03/2020, 02:00–02:30, 05:00–05:30 e 23:00–23:30 UTC. Nenhum parâmetro foi reajustado depois dessa avaliação. São blocos temporais não usados nos testes anteriores, do mesmo dia de um arquivo já conhecido; **não são sessões independentes da corretora do usuário**.

Testes de causalidade, simetria, isolamento de dados futuros e comportamento das regras: 4 + 5 passaram. Eles verificam o algoritmo, não comprovam lucro ou aumento de assertividade. O candidato de padrões reprovou primeiro dois testes por uma suposição incorreta do fixture: a seleção gulosa pode não encontrar três exemplos em qualquer trajetória. O fixture passou a ter três trajetórias comparáveis separadas por 36 segundos; a regra e os resultados do candidato não foram ajustados por isso.

## Reprodução e arquivos

- `node --test tests/sentinel-diverse-analogue-research-20261018.test.mjs tests/sentinel-rejection-room-research-20261018.test.mjs`
- `node scripts/sentinel-diverse-analogue-ab-20261018.mjs`
- `node scripts/sentinel-rejection-room-ab-20261018.mjs`
- `SENTINEL_ROOM_SET=reserved node scripts/sentinel-rejection-room-ab-20261018.mjs`

Relatórios completos e três fixtures novos foram preservados em arquivos `.json.gz`. Descompactar para os caminhos `.json` correspondentes antes da reprodução. O script de preparação confere o hash do arquivo bruto e gera os blocos sem interpolar ticks.

**Conclusão prática:** as duas alterações foram descartadas. A melhora da assertividade continua sem comprovação. O ajuste de leitura do saldo preparado na etapa anterior é independente desses candidatos.
