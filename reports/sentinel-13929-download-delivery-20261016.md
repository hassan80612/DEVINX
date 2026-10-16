# Entrega dos instaladores 13.9.29

O usuário relatou novamente “Download error” antes de haver confirmação de uma instalação concluída. A versão operacional 13.9.29 permanece preservada.

Foram revistas ocorrências anteriores: downloads redirecionados a HTML de login, nomes antigos/reescritas, problemas de cabeçalho e remoção de EXE pelo navegador/Windows foram observados em momentos diferentes. Essas ocorrências não demonstram qual é a causa da mensagem atual.

Verificações públicas atuais, sem sessão: EXE exato, alias do botão e ZIP alternativo retornam arquivos completos, com assinatura MZ/PK correta. O EXE foi previamente extraído e comparado com as fontes revisadas. Pedidos de retomada `Range: bytes=0-63` com User-Agent de Edge Windows retornaram HTTP 206, intervalos corretos e bytes corretos, sem HTML nem redirecionamento ao login.

Diferença confirmada: o link versionado fornecido na conversa era servido como `application/x-msdos-program` e `Content-Disposition: inline`, enquanto o alias usado no botão já era `application/octet-stream` e `attachment`. O ZIP alternativo também era servido como inline.

Este ajuste aplica os cabeçalhos de arquivo baixável ao EXE da release atual e ao ZIP alternativo; a versão vem do manifesto, evitando outra exceção presa ao nome 13.8.9. Preserva os redirecionamentos de versões aposentadas e os controles de acesso existentes. O painel passa a exibir o ZIP alternativo com instruções de extração junto aos locais de instalação do Agent, em português/inglês e apenas no PC. Não altera o motor, o relógio, o código do Agent, nem exige uma versão diferente de 13.9.29.

Sete testes de regressão da entrega e proteção passaram. As regras da release atual foram verificadas diretamente, e a compilação completa Next.js passou. A causa específica de uma eventual remoção/bloqueio no computador do usuário não é inferida desses testes de servidor; não há teste de Edge/Defender no PC do usuário nesta sessão.
