# Sentinel 13.9.29: publicação conferida

- URL: https://trading.devinx.com.br
- Status: READY, produção, aliases atribuídos sem erro.
- Deployment: `dpl_54tCKCH1JT4crDzKjggpyun4zJtp`.
- Commit publicado: `02ec99205bc5d34f0b574d27f7d525df1ba6c779`.
- Branch: `release/sentinel-13.9.29`.
- Build remoto: aproximadamente 52 segundos.
- Verificação pública: manifesto, EXE exato, alias Windows, ZIP alternativo e home retornaram HTTP 200.
- Fontes de runtime, seleção de direção, retenção, projeção e driver extraídas do EXE são idênticas às revisadas.
- ZIP alternativo: mesmo payload; CMD com quebras Windows reais.
- Verificação inicial de logs error/fatal do deployment: nenhum registro no intervalo consultado de 10 minutos, imediatamente após a publicação. Não é uma medição de estabilidade de longo prazo.

{
  "version": "13.9.29",
  "build": "13.9.29-fast-feed-context-adaptive-expiry-direction",
  "http": "all 5 URLs 200",
  "exeBytes": 2664960,
  "exeSha256": "84de5d551654190aa8269bed8441147aa14e585f3912b9b60838e83ba181fdc5",
  "zipSha256": "7573084b7ae04353812f5ce45dd1e802a4e83f63471df0f301891f95222b77dc",
  "reviewedSources": "identical",
  "alternative": "identical payload, real Windows line endings",
  "homeBytes": 18624
}

243 testes e compilação completa aprovados. As correções de histórico, alvo sincronizado e seleção de direção estão integradas. O usuário precisa instalar o Agent Windows 13.9.29. Nenhuma taxa de 90% real foi comprovada.
