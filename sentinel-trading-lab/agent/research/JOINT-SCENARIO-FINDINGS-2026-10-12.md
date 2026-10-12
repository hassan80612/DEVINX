# Sentinel 67.2 — previsão conjunta de direção, preços e extremos

**Decisão: preservar a versão publicada.** O novo protótipo resolveu a incoerência entre os componentes e aproximou os preços dos extremos, mas não trouxe avanço significativo de direção. Em 2.208 previsões reais externas, passou de 1.042 para 1.045 acertos (+3), com perda em BTC, ganho em ETH e regressões relevantes em prazos curtos. Nas simulações, o desempenho caiu.

Data de registro: 12/10/2026 UTC, noite de 11/10 em America/Sao_Paulo. Baseline publicada: Sentinel 13.4.67.2, build `13.4.67.2-strategy-copy-1011`, commit `66c42ff6da4e7af7268a933b9ff83ddfe0b9be90`. Nenhuma publicação ou alteração de código de produção, visual, funções, mobile, downloads ou permissões de operação.

## O que mudou de fato

Os protótipos anteriores estimavam direção, preços e extremos por componentes independentes. Este aprende uma distribuição condicional de caminhos futuros completos, todos provenientes de resultados históricos já observáveis.

Um classificador supervisionado particiona os contextos por direção entre entrada e vencimento. A distribuição produz uma direção mais apoiada; apenas caminhos históricos com essa direção compõem a previsão. Foram congeladas duas representações:
1. Média condicional dos caminhos, em preço logarítmico normalizado.
2. Caminho representativo, próximo da média entre exemplos com peso suficiente.

A cotação e a volatilidade atuais ancoram a trajetória. Entrada, vencimento, CALL/PUT, preços e horários de topo/fundo e indicação de reversão saem da MESMA trajetória, com todos os pontos de 1s. Não se trocou um sinal, ordenou preços estimados independentemente nem moveu o extremo para esconder contradição.

Não há mistura com previsões da estratégia publicada ou com estratégias selecionáveis da corretora. O experimento continua fora do runtime.

## Novos dados e validação

- Sementes e hiperparâmetros congelados antes dos resultados; seis configurações do classificador, escolhidas só por resultados históricos completos com validação cronológica purgada.
- 1.440 novos casos sintéticos: dez geradores, oito sementes novas, três emissões e seis prazos.
- 2.208 novos casos reais: BTCUSDT e ETHUSDT, 27–30/09/2026, oito arquivos de 86.400 barras de 1s, com SHA256 original verificado e registrado.
- Mesma janela de 3.600 pontos e mesmas emissões em todas as comparações. Emissão T, entrada T+H, vencimento T+2H; H=5/10/30/60/120/300s. Emissões reais separadas por 1.800s.
- Fechamento da barra observável só em abertura+1000ms. Quotes futuras e backfills indisponíveis foram rejeitados.
- 132 casos reais sem mudança de preço não são vitórias. Há também denominador sem empate: 2.076 casos.
- Cobertura 100%; nenhuma previsão foi omitida para inflar a taxa.
- Dados reais externos de spot, não resultados na IQ Option/Exnova, nem taxa observada pelo usuário, execução ou lucro.

## Direção

| Avaliação | 67.2 | Novo modelo |
|---|---:|---:|
| Simulações, 1.440 casos | 73,75% | 71,39% |
| Preços reais, todos os casos | 47,19% (1.042/2.208) | 47,33% (1.045/2.208) |
| Preços reais, sem empate | 50,19% | 50,34% |
| Direção em 935 casos reais de reversão | 49,09% | 49,52% |

As duas representações compartilham a mesma direção. O modelo corrigiu 369 erros e prejudicou 366 acertos: benefício líquido de três acertos. BTC caiu de 526 para 521 acertos; ETH passou de 516 para 524.

| Prazo | 67.2 | Novo modelo |
|---|---:|---:|
| 5s | 47.28% | 40.76% |
| 10s | 44.84% | 47.28% |
| 30s | 45.92% | 45.38% |
| 60s | 46.47% | 49.46% |
| 120s | 51.09% | 49.18% |
| 300s | 47.55% | 51.90% |

5s piorou 6,52 pontos e 120s piorou 1,91; 300s melhorou 4,35 e 60s melhorou 2,99. Quatro arquivos melhoraram e quatro pioraram. O intervalo descritivo de ganho, por reamostragem de arquivos inteiros, ficou entre -2,08 e +2,54 pontos. Oito arquivos e várias hipóteses são evidência limitada; não há superioridade comprovada.

## Coerência: resolvida no protótipo

Em todos os 3.648 casos de avaliação, verificações independentes conferiram os valores retornados e todos os eventos:
- Zero divergência entre CALL/PUT e os preços de entrada/vencimento.
- Zero faixa com topo abaixo de fundo.
- Zero desacordo entre indicação de reversão e a direção da mesma trajetória em relação ao preço passado.
- Topo e fundo são pontos da própria curva e máximos/mínimos do período de entrada ao vencimento.

Isso comprova consistência da representação, não precisão do futuro. A versão publicada 67.2 já tem sua própria representação; os 24% de divergência citados antes pertenciam ao protótipo anterior, testado em OUTROS dias. Não há comparação pareada de 24% para zero entre os mesmos testes.

## Extremos: ganhos específicos, insuficientes

Somente H>=30s, 1.472 casos, tolerância de horário ±10s. Intervalos de 5/10s não entram nessa métrica.

| Horário dentro de ±10s | 67.2 | Média condicional | Caminho representativo |
|---|---:|---:|---:|
| Topo | 24,46% | 25,75% | 26,09% |
| Fundo | 23,78% | 24,32% | 28,06% |

O caminho representativo ganhou 24 horários corretos de topo e 63 de fundo. A média do erro de horário caiu de 59,09 para 54,92s no topo e de 57,76 para 52,30s no fundo. Ainda é um erro grande.

| Erro médio do preço do extremo, em pontos-base | 67.2 | Média condicional | Caminho representativo |
|---|---:|---:|---:|
| Topo | 15,47 | 13,54 | 10,48 |
| Fundo | 14,42 | 13,82 | 11,30 |

Os preços dos extremos ficaram mais próximos dos reais. Esse ganho não se converteu em melhora significativa de CALL/PUT. Na simulação, os extremos do novo modelo pioraram: o ganho não é generalizado.

## Custo de cálculo

Sonda local em Node 24, mesma série temporal de 1h, seis previsões H→2H:
- Base publicada: 80,99 e 51,28ms por lote.
- Protótipo conjunto: 1.205,01 e 986,11ms por lote.

São sondas locais, não medição no computador do usuário nem da interface completa. A nova rotina é consideravelmente mais custosa e não foi integrada ao Agent; exigiria otimização e teste de atualização em tempo real antes de qualquer proposta de publicação.

## Conclusão

A representação conjunta eliminou as contradições e melhorou parte da estimação de extremos. Não entregou o avanço de assertividade solicitado, ficou mais pesada e teve regressões. Não foi publicada.

Os experimentos mostram que coerência, estimativa do preço, horário do extremo e acerto de direção são objetivos diferentes. Melhorar um não demonstra vantagem nos demais. A pesquisa permanece documentada; nenhuma próxima arquitetura ou taxa de acerto foi prometida.

## Reprodução e arquivos

- Quatro contratos passaram: cenário único coerente, fronteiras temporais, isolamento de futuro/verdade externa, invariância de densidade e ausência de direção em histórico plano/desatualizado.
- Comparação de Git confirmou versão publicada intacta.
- Execução de contratos e quatro lotes independentes: https://github.com/hassan80612/DEVINX/actions/runs/38186960085 .
- Plano congelado: [JOINT-SCENARIO-FROZEN-2026-10-12.md](JOINT-SCENARIO-FROZEN-2026-10-12.md).
- Métricas: [simulações](JOINT-SCENARIO-SYNTHETIC-2026-10-12.json), [preços reais](JOINT-SCENARIO-EXTERNAL-2026-10-12.json).
- Os scripts também executam todos os casos sem divisão em lotes. Sementes, modelo, checksums e contagens pareadas persistidos; detalhes completos e decisões por caso nos artefatos da execução, retenção de 14 dias.
