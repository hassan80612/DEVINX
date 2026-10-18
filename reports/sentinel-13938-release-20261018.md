# Sentinel 13.9.38 — integridade de cotação, isolamento de mercados e saldo

Publicação autorizada pelo usuário em 18/10/2026. Base: produção 13.9.37, commit 21f43a9587e2a4f6cdb23933226b4b0f0520e466.

Inclui exclusivamente três correções: leitura do saldo em evento de liquidação aninhado; preservação da hora original das velas para impedir que eventos atrasados substituam cotações mais novas; isolamento de sinal e avaliação por corretora/ativo, com contadores por estratégia e prazo.

O sinal emitido mantém direção, preço e prazo imutáveis durante seus 30 segundos. Não acrescenta temporizador, leitura de relógio da corretora, coleta adicional de histórico nem operação de banco. O launcher Go e o instalador PowerShell permanecem idênticos à versão anterior. Os modelos preditivos experimentais rejeitados não fazem parte desta versão.

327 testes passaram na cópia de trabalho. O replay controlado de 29 entregas atrasadas por adaptador eliminou 29 promoções indevidas de preço e preservou todas as 43 decisões da referência limpa. Isso valida integridade de dados, não aumento percentual de acerto de mercado. As duas execuções de adaptador usam o mesmo caminho de preços Forex externo, não duas sessões independentes. O início nativo no Windows e o resultado em operações reais não foram verificados.
