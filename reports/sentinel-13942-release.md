# Sentinel 13.9.42 — pontos CALL/PUT independentes por corretora

O usuário mostrou a 13.9.41 ainda desligada com erro de identificação dos botões. Os testes anteriores usavam botões HTML simplificados e não validavam o painel gráfico real. Não houve teste autenticado nem ordem real nesta correção.

## Mudança

- Detector HTML considera controles customizados e elimina duplicação de botão/contêiner, sem escolher arbitrariamente entre dois painéis.
- Novo botão **Mapear CALL/PUT** no painel da corretora. Para controles desenhados no canvas, o usuário aponta o centro de CALL e depois PUT. Uma camada de captura recebe integralmente os eventos desses dois cliques; os eventos não chegam ao canvas. Esc ou Cancelar encerram a indicação.
- Os dois pontos são relativos ao canvas identificado por caminho e ID, com origem, rota, tamanho do canvas, tamanho da janela e escala de pixels. São salvos somente no computador, em `worker/data/executor-targets.json`, com chaves separadas para `iq_option` e `exnova`. Não são enviados ao Supabase.
- Alteração de página, tamanho ou zoom exige novo mapeamento. Mudanças internas do desenho mantendo as dimensões não podem ser identificadas sem ler a imagem; o usuário deve remapear se mover os botões ou reorganizar o painel. Nenhuma leitura de imagem/OCR foi adicionada.
- Após a configuração, o executor apenas envia um clique ao ponto da direção final do analista, mantendo o vencimento e cálculo local já existentes. O próprio card fica temporariamente transparente a eventos de ponteiro durante o clique, sem esconder o visual. Não há leitura de saldo, valor, duração ou tipo de conta.
- A indicação só é permitida com bot parado e sem entrada pendente. Ela não arma o bot.

## Evidência da estrutura

A página pública de IQ Option `https://iqoption.com/traderoom` carregava o loader `https://static.cdnpub.info/traderoom/toLoad.js?v=46d8aa430a23842acc012b05b16b5457?v=1791196444`. Seu bundle público `https://static.cdnpub.info/traderoom/bundle.js?v=1791196444` faz referência a canvas, WebAssembly e `glengine35a63969.wasm.js`. Isso demonstra por que procurar somente elementos `button` não cobre o cliente gráfico. A página Exnova sem autenticação retornou a página de apresentação; seu painel autenticado não foi inspecionado. O caminho canvas é configurável independentemente em ambos os provedores, sem supor que os pontos sejam iguais.

## Validação

368 regressões de prebuild passaram. Teste Chromium com canvas em origens locais interceptadas para IQ Option e Exnova: nenhum evento de ponteiro ou clique da configuração chega ao canvas; CALL/PUT de execução têm pontos distintos por corretora; sinal duplicado não repete clique; cálculo por cotação; recarga de JSON preserva ambos; mistura de corretora é recusada; redimensionamento exige nova indicação; Esc cancela sem operar. Controles HTML customizados e contêineres aninhados também passaram. São fixtures locais, não sessões reais das corretoras.

Motor do analista, feed, relay, launcher e instalador PowerShell estão byte a byte iguais à 13.9.41. O original 13.9.38 permanece no commit `3d9317181686a5b14bdb57834560d984d9ea375c`, branch `backup/sentinel-13.9.38-original-20261018` e deployment `dpl_8krxzDhKBrVr8BxqJWUj3UdBqJkm`.

Versão: 13.9.42. Build: 13.9.42-broker-canvas-call-put.
EXE SHA256: `6f24f545772147642af3861d072c1538a18d3f7011314c9dbbb370345401d842`.
Payload SHA256: `a999a7a8c7e154e5cee429f3aab933f928cb932b20cce5de657d41b926542c95`.

O EXE foi gerado com Go 1.24.9 verificado e não foi executado em Windows nesta sessão. Clique enviado não equivale a confirmação de ordem pela corretora; os resultados continuam estimativas pelos dados do analista.
