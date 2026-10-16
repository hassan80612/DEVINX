# Sentinel 13.9.24 — publicação concluída

A pedido do usuário (“Lança esse avanço”), foi publicada a candidata original de projeção de 30s, sem os acréscimos posteriores que pioraram os resultados.

- Site: https://trading.devinx.com.br
- Instalador: https://trading.devinx.com.br/downloads/Sentinel-Agent-13.9.24.exe
- Deployment: `dpl_935yeemFsCCshnCZHGPdZY1a9Vt3`, produção, **READY**, sem erro de alias.
- URL do deployment: https://sentinel-trading-a8iz0ojfp-iguassu-shop.vercel.app
- Commit publicado: `971e087c9eb1185f5fe3098cc2ce3f193dad47c7`.
- Árvore de fonte: `125be6d04ca7fff449a1503bc55cbe97de3de4f1`.
- Branch preservada: `release/sentinel-13.9.24`.
- A linha anterior de produção, `fix/sentinel-floating-small-window-20261015`, foi avançada com conferência do commit anterior, sem force, para o mesmo commit.
- Build remoto concluído em aproximadamente 46s. Framework Next.js 15.5.27; Go 1.24.9 para o instalador Windows.

## Verificação após a publicação

O manifesto público retornou 13.9.24 com HTTP 200. Tanto a URL de versão quanto o alias usado no site retornaram instaladores Windows idênticos, com HTTP 200 e 2.660.352 bytes.

O ZIP embutido no executável público foi extraído e conferido contra o manifesto. Dentro dele, a release indica 13.9.24; `now-opportunity-engine.mjs` e `thirty-second-expiry-direction.mjs` são byte a byte iguais ao fonte revisado e testado.

- SHA256 do ZIP **publicado**: `12973a5617bfac3c0023b012260d0a2013d4504732c38debcd4bb2efc8d52bd9`.
- SHA256 do EXE **publicado**: `16bc25f57c76cf9376230ea24e444064380e94fcf933134fca8e77c14a10f134`.

A consulta de logs de erro/fatal do deployment nos 10 minutos anteriores não encontrou registros. Essa consulta inicial não equivale a observar uma sessão do usuário no Windows.

## O que foi entregue

Nos mesmos horários do replay mais preciso do vídeo, a candidata passou de 9 favoráveis/5 desfavoráveis para 10/4: **64,3% → 71,4%**. Um sinal final ficou sem desfecho. É resultado exploratório nessa gravação, não taxa comprovada ao vivo nem meta de 84% atingida.

A autorização das entradas, seus horários e a chamada única durante os 30s são preservados. As durações de 5s, 10s, 15s e 60s permaneceram iguais à 13.9.23. Não houve acréscimo de cooldown, espera por outra vela ou execução automática de ordens.

Os **213 testes obrigatórios passaram**. A verificação inclui o caminho real de ingestão/snapshot/decisão do runtime, não apenas o cálculo isolado. A regressão conhecida no horário alternativo 13:53:20 também está explicitamente registrada, sem ocultar perdas individuais pelo ganho agregado.

É necessário que o Agent Windows esteja na **13.9.24** para usar o novo motor. A publicação do site, por si só, não prova que o programa no computador do usuário já foi atualizado.

O relatório de implementação e as regressões da entrega estão preservados no commit publicado, em `reports/sentinel-13924-release-20261016.md`. A 13.9.23 permanece preservada como referência e possibilidade de retorno.
