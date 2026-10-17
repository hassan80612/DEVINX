# Publicação Sentinel 13.9.34 — 17/10/2026

Publicada em https://trading.devinx.com.br. Produção READY: `dpl_95sSddGbHXV4QmAewMHZdsEfZ7X3`, commit `fa0343e9df66511072d51efa7b39d5c40fca5443`, árvore `ffd14721179ed93fb50a9bf974b9fc857fe4fa72`. A árvore remota foi conferida contra a fonte local testada antes de publicar.

A versão corrige o descarte de histórico válido recebido com menos de 50 velas na passagem driver → adaptador → runtime. Conserva a validação própria da cotação atual, ativo, integridade e frescor. O motor usa as janelas efetivamente recebidas, sem criar histórico ou nova espera. Também inclui a escolha inicial por ajuste penalizado com cobertura suficiente, conforme a pesquisa documentada. O mapa de níveis e a sequência observada da 13.9.33 foram preservados.

Os 272 testes passaram. Os 21 testes direcionados de ingestão, escolha inicial e compatibilidade de assinatura foram repetidos após a alteração de versão e passaram. A comparação controlada anterior demonstrou o defeito em 16 casos abaixo de 50 velas e conservou oito casos com 50/100 velas. Esses casos não medem acertos de mercado.

Downloads reais do domínio canônico conferidos: EXE 13.9.34, dois aliases genéricos idênticos, ZIP alternativo, manifesto e ZIP interno. CRCs válidos; SHA do conteúdo corresponde ao manifesto; o EXE contém exatamente esse ZIP; oito módulos conferem byte a byte com a fonte revisada. O comando alternativo mantém `-OpenSiteAfterInstall`. Download parcial do EXE retornou HTTP 206 com bytes corretos. Os hashes e tamanhos estão no JSON associado.

O domínio canônico aponta para o novo commit e retornou HTTP 200. Não foram encontrados logs de erro/fatal na consulta inicial da publicação; a janela de observação é curta. Não foi executado instalador nativamente no Windows nem testada a interface autenticada nesta máquina Linux.

O replay conhecido passou de 10 acertos/4 erros para 11/3, com um vencimento ausente em ambos, mesmos instantes/preços/vencimentos. Esse ganho vem da escolha inicial, não mede a correção de ingestão e não comprova assertividade real futura. Três erros permanecem no replay. A avaliação sintética do ajuste teve cinco trajetórias melhores, uma pior e nove iguais. Não há garantia de 84–90% nem eliminação geral de erros.

A correção está no Agent; para testar no Windows é necessário instalar a 13.9.34 e abrir uma nova sessão do Agent. Instalador: https://trading.devinx.com.br/downloads/Sentinel-Agent-13.9.34.exe.

Este registro sucede o relatório de pesquisa `sentinel-received-history-fix-20261017.md`, escrito antes da publicação; as declarações de não publicação naquele relatório descrevem a etapa anterior.
