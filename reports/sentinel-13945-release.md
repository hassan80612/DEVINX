# Sentinel 13.9.45 — vencimento coerente da previsão e do aprendizado

Publicação autorizada em 19/10/2026. A previsão estreita, a alternativa ampla e a avaliação dos modelos usam o mesmo prazo de 30 segundos após a decisão do analista. Antes, a cotação podia anteceder a emissão e fazer esses cálculos apontarem para um vencimento anterior ao da chamada. O cache considera o vencimento efetivo. Um prazo explícito é preservado.

Somente três arquivos do núcleo foram alterados. Bot, leitura da corretora, critérios de liberação e janela ativa permanecem iguais à 13.9.44. Não foram incluídos os árbitros, filtros de regime, inversões ou modelos experimentais reprovados. O clique efetivo da corretora é um evento separado do instante de decisão. Esta publicação não anuncia melhora comprovada de assertividade.

Validação local: 397 testes obrigatórios aprovados, build Next de produção concluído e pacote de 118 arquivos conferido byte a byte. Cinco testes cobrem especificamente o vencimento e 29 verificações prévias de integração também passaram em cópia corrigida. O instalador Windows foi compilado com Go 1.24.9 e contém exatamente o payload. Não houve execução nativa do EXE no Windows nem operação financeira nesta sessão.

Rollback imediato: commit e885d12a06d5477e0dfcfed375a688d3397f230c, versão 13.9.44, deployment dpl_A1Mm34aDgbVwSzVD9GXdUF7a6yDT. O original 13.9.38 e seus backups permanecem preservados. Nenhuma mudança de banco de dados é necessária nesta versão.
