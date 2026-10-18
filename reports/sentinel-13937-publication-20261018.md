# Sentinel 13.9.37 publicada

- Domínio: https://trading.devinx.com.br
- Ambiente: produção, READY; Next.js.
- Commit: `21f43a9587e2a4f6cdb23933226b4b0f0520e466`.
- Árvore: `f332105ea4d6ebea731608f3856e6e67bf635be5`.
- Branch: `fix/sentinel-13937-binary-objective-expiry-20261018`.
- Deployment: `dpl_8VGYwRMTSWMvdYsGtoZt8FMUGpNg`.
- Endereço imutável: https://sentinel-trading-7xer7qn29-iguassu-shop.vercel.app
- Build: `13.9.37-binary-objective-expiry-consistency`.
- Build do servidor: 51 segundos até concluir os artefatos.
- Referência anterior preservada: 13.9.36, commit `a6e810400ecf1d909293d80818aa6282f5e81569`.

Publicadas apenas as duas correções autorizadas: direção por votos binários coerente com a força e avaliação de cotações no vencimento, sem emprestar um movimento posterior. Não foi demonstrado ganho consistente de assertividade com o conjunto dessas correções; a solicitação foi disponibilizá-las antes de continuar a investigação.

296 testes do procedimento completo passaram. O servidor recompilou o instalador real. O EXE e o ZIP foram baixados tanto do endereço imutável quanto do domínio principal: CRC, SHA-256 do manifesto, payload embutido, aliases genéricos, resposta HTTP 206 de leitura parcial e 112 arquivos do Agent exatamente iguais ao código local foram verificados. Vinte regressões passaram executando os módulos extraídos do payload publicado, incluindo runtime/seletor. O pacote local e o do servidor têm o mesmo SHA-256.

O launcher Go e o instalador PowerShell continuam idênticos aos da 13.9.36. Um teste antigo adicional, fora do procedimento obrigatório, ainda procura o nome de variável `$h` de uma revisão antiga do instalador; essa asserção já não corresponde ao instalador preservado. Ela não foi removida ou modificada para esconder o problema. As verificações atuais de download, pacote, startup e fechamento do instalador no procedimento obrigatório passaram. A execução nativa no Windows do usuário não foi realizada.

EXE: 2.659.328 bytes, SHA-256 `a076d80034c7cc7dab0d12989a0caea506e9ee9f1064831d2089da83909e1b59`.

Payload: SHA-256 `a2bc6e4fcbcb6abbd3dae7e635d41f9e43e2fa9b71e9aeb30c3084172d3f689b`.

A API disponível não expõe o parâmetro de criação sem atribuição de domínios. A publicação de produção atribuiu os aliases automaticamente após o build; não houve promoção separada. O endereço imutável e o domínio principal foram verificados em seguida, ambos na versão correta. O alias principal foi confirmado no deployment acima.

Página inicial respondeu HTTP 200. A consulta sem sessão a `/console` terminou em `/login?next=%2Fpainel`, HTTP 200; não é uma verificação do painel autenticado. O manifesto público anuncia 13.9.37. Consulta inicial de logs de erro/fatal, limitada ao deployment novo, não encontrou grupos de erro. A janela é curta e não substitui monitoramento prolongado ou validação em operações reais.

Downloads:

- https://trading.devinx.com.br/downloads/Sentinel-Agent-13.9.37.exe?build=13.9.37-binary-objective-expiry-consistency
- https://trading.devinx.com.br/downloads/Sentinel-Agent-13.9.37-Alternativo.zip?build=13.9.37-binary-objective-expiry-consistency
