# Correção preparada: vencimento da previsão e do aprendizado

Estado: correção de consistência temporal preparada e testada, sem publicação. Não demonstra aumento da assertividade e não resolve isoladamente a baixa qualidade preditiva relatada.

O ciclo de entrada usa `exitAt = now + durationMs`, mas a previsão padrão usava `quoteAt + 30000`, e a comparação dos modelos enfileirava o resultado no mesmo relógio antigo da cotação. Uma cotação válida pode anteceder a decisão em até 1.450 ms. Portanto, os módulos podiam avaliar preços em vencimentos diferentes.

A correção usa um único vencimento explícito para a previsão estreita, a alternativa ampla e o aprendizado. Na ausência de prazo explícito, calcula 30 segundos após o horário da decisão. O cache inclui o vencimento efetivo para não reaproveitar uma previsão anterior quando a mesma cotação é analisada em outro instante. Um prazo explícito permanece soberano. O bot, a leitura da corretora, os critérios de liberação e o estado da janela ativa não são alterados. O clique real da corretora continua sendo um evento separado do horário de decisão do analista.

Cinco testes específicos passaram: deslocamento entre os relógios, preservação de prazos explícitos e cotações sem atraso, aprendizagem apenas no prazo correto, invalidação do cache e integração do prazo no analista. Em uma cópia com os três arquivos corrigidos, outros 29 testes existentes de seleção, vencimento, ingestão pelo runtime, janela única, causalidade e espelhamento passaram. Cotações com idade zero preservam o cálculo anterior. Não foi alegada nova taxa de acertos a partir desses testes funcionais.

Um diagnóstico explicitamente solicitado ao Agent conectado confirmou os relógios distintos. Foram lidos apenas buffers já existentes, sem nova consulta à corretora nem envio de ordens. Os dados privados estão fora do repositório público. O exemplo nativo observado manteve a mesma direção após o ajuste; não demonstra que a divergência temporal explique a maioria das perdas.

Base de produção preservada: 13.9.44, commit e885d12a06d5477e0dfcfed375a688d3397f230c. O ramo preparado contém três arquivos do núcleo alterados, o gerador isolado, os testes e este relatório; nenhum executável foi distribuído.
