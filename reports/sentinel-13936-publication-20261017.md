# Sentinel 13.9.36 publicada

- URL: https://trading.devinx.com.br
- Ambiente: produção; READY.
- Commit de produção: `a6e810400ecf1d909293d80818aa6282f5e81569`.
- Deployment: `dpl_DBsjbzm5ShHi1o5jyourWoJMuxCT`.
- Build: `13.9.36-observed-timestamp-sampling`.
- Base preservada: 13.9.35, commit `406c8f6b7ffa6fa90cad6575c0903ba78205b697`.

Publicada exclusivamente a correção de seleção das observações reais do histórico. Nenhum filtro experimental de momento da vela foi incluído. A alteração não demonstra ganho geral de assertividade.

283 testes completos passaram (85 + 20 + 139 + 39). O build do Vercel terminou READY; o manifesto público anuncia a 13.9.36. A requisição sem sessão a /console terminou em https://trading.devinx.com.br/login?next=%2Fpainel com HTTP 200. Downloads do EXE e ZIP foram conferidos no endereço do deployment e no domínio principal, incluindo CRC dos ZIPs, manifesto SHA-256, aliases genéricos idênticos, leitura parcial de 1024 bytes e 111 arquivos do pacote exatamente iguais ao código da versão. Os sete testes novos também passaram executando o módulo extraído do pacote publicado que está embutido no EXE.

EXE: 2.658.816 bytes, SHA-256 `0f4d60c10b00826016a09cdfd96b21de4b3c0b01c9de0cc00dabd29d36f932c1`. Pacote: SHA-256 `ca922ec30d107e6a9510625610ff1d604ec6ec6bf6039aa010d2dfdcbae6e820`. A compilação local e a do servidor produziram o mesmo pacote.

A consulta inicial de logs do deployment não encontrou erro/fatal; é uma janela curta de observação. A execução nativa no Windows do usuário e a assertividade em operações reais não foram comprovadas por essas verificações de código e download.
