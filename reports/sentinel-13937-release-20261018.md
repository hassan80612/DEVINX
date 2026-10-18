# Sentinel 13.9.37 — coerência da direção e do vencimento

Publicação expressamente autorizada pelo usuário, baseada na produção 13.9.36 (`a6e810400ecf1d909293d80818aa6282f5e81569`). Build: `13.9.37-binary-objective-expiry-consistency`.

O comparador de padrões passa a escolher a direção pela diferença entre votos ponderados de CALL e PUT, em concordância com a força que já calculava. O retorno médio ponderado continua informativo. Um movimento raro de maior tamanho deixa de inverter a direção usando a força dos votos contrários.

O seletor de projeções e a contagem de resultados observados passam a usar a última cotação recebida no vencimento ou antes dele, com idade máxima de um segundo. A cotação atual explícita também vale quando seu timestamp está no prazo. Movimentos posteriores não avaliam uma previsão já vencida. Sem referência válida, não é inventado resultado. Isso continua sendo avaliação de cotações, não liquidação de ordens reais.

A direção, preço de entrada e janela de 30 segundos continuam imutáveis após o sinal. A versão não acrescenta temporizador, coleta de histórico, consulta ao relógio da corretora ou operação de banco. Os filtros experimentais de reversão, momento da vela, concordância e inserção de entradas não foram incluídos.

Os testes de precisão não demonstraram ganho consistente com as duas correções juntas: os 14 trechos externos conhecidos permaneceram em 278 acertos/296 erros e um trecho novo de outro dia em 28/22. As duas extrações do vídeo preservaram suas entradas. São dados Forex externos ou extrações limitadas de vídeo, não uma medição da conta atual nem prova de 70%, 80% ou 90% ao vivo. A publicação atende à solicitação de disponibilizar a correção de cálculo antes de continuar a investigação.

296 testes da preparação completa passaram. Treze regressões novas verificam as correções diretamente nos módulos de produção e ficam no procedimento de build. A construção recompila o EXE real com os metadados e payload exatos da versão. O launcher e o instalador PowerShell mantêm o comportamento já aprovado na 13.9.36.

Antes de promover: conferir o download de EXE e ZIP, CRC, manifesto SHA-256, payload embutido no EXE, identidade de todos os arquivos do Agent, aliases genéricos, resposta de download parcial e 20 regressões executadas nos módulos extraídos do pacote publicado. A inicialização nativa no Windows e a assertividade em ordens reais não são comprovadas por essas verificações.
