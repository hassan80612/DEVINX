# Investigação da decisão final — 19/10/2026

Nenhuma alteração de assertividade foi aprovada ou publicada. Bot, controles móveis e os 75 arquivos originais do motor permanecem preservados. Este relatório distingue falha de implementação de vantagem preditiva.

## Previsão direta do encerramento

Foi implementado um modelo logístico congelado, com 23 características causais de preço e 2.284 exemplos de treinamento em nove janelas de criptomoedas de 15–17/10/2025. Não houve busca de parâmetros após os resultados. O alvo é o preço 30 segundos após a observação, mantendo a entrada, o preço e o vencimento originais. A inferência JavaScript corresponde à inferência Python; dados futuros e recebimentos tardios são excluídos.

Na triagem de 18–20/10, o resultado passou de 254 acertos/251 erros (50,30%) para 261/244 (51,68%), mas o resultado ilustrativo com entrada fixa e payout de 86% continuou negativo: −32,56 para −19,54 unidades. A maior sequência de perdas passou de 8 para 10. Reprovado. No Forex, apenas 13/643 entradas tinham histórico que atendia aos critérios de observação contínua do modelo; as demais preservaram o sinal original. Isso não valida a transferência do modelo para esse mercado.

## Reutilização de eventos estruturais

O detector original volta a adicionar uma sequência de rompimento/reteste ou recuperação em cada cotação posterior que satisfaça a condição, marcando `confirmedAt` com o horário atual. Um teste reproduziu um mesmo evento originalmente confirmado 26 segundos antes sendo apresentado como recém-confirmado.

A cópia experimental conserva a primeira confirmação e impede consumir duas vezes a mesma identificação estrutural. O sinal em andamento e seu vencimento continuam imutáveis; novos eventos não recebem espera artificial. As demais rotas e outros contextos continuam funcionando.

Isso corrige a identidade/cronologia de um evento, mas não demonstrou melhora preditiva. Nos 15 trechos Forex completos, ambos ficaram em 306/318 (49,04%). Nos nove trechos completos de criptomoedas de 15–17/10, passou de 300/228 (56,82%) para 299/228 (56,74%). A investigação foi interrompida após esses dois conjuntos completos reprovarem a aceitação predefinida; os trechos já concluídos do segundo lote ficam identificados como parciais. Nenhuma janela de validação nova de 21–26/10 foi consumida.

Oito testes de causalidade, equivalência de inferência, preservação do sinal ativo, eventos repetidos, contexto e memória limitada passaram. Testes funcionais não foram apresentados como evidência de lucro ou assertividade.

## Evidência privada e conclusão

O vídeo do usuário foi recuperado e transcrito para diagnóstico, conservando observações indisponíveis como ausentes. Uma captura autenticada e limitada a três minutos registrou preços e sinais do Agent em execução, com o motivo confirmado apenas quando o horário da avaliação coincidia exatamente com o horário de emissão. Nenhum comando de operação, nova leitura da corretora ou fluxo contínuo de gravações no banco foi criado. Essa amostra é pequena e seus resultados por cotação não são liquidações financeiras.

Os dados do usuário e as chaves temporárias não integram este repositório público. O arquivo de capacidade usado pelo observador foi eliminado; a conexão foi encerrada no limite definido.

Resultado: a correção de cronologia está preparada e testada em isolamento, mas ainda não existe ganho consistente suficiente para uma atualização de assertividade. Publicar qualquer uma das duas hipóteses como solução seria afirmar algo que os testes não demonstraram.

Base de produção: `e885d12a06d5477e0dfcfed375a688d3397f230c` (13.9.44). Os arquivos de análise são idênticos aos da base de pesquisa 13.9.43. Scripts, especificações congeladas, modelo e resultados comprimidos ficam disponíveis para reprodução; exige Node.js, TypeScript instalado para os testes da aplicação, Python com NumPy/scikit-learn e, para transcrição de vídeo, Pillow/Tesseract/FFmpeg.

Os arquivos brutos externos não fazem parte desta árvore; a reprodução integral requer regenerá-los das fontes fixadas nos relatórios anteriores. Os oito testes unitários usam uma pequena amostra derivada incluída no repositório.
