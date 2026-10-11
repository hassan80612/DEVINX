# Sentinel — próxima pesquisa de extremos, após publicação 67.2

Produção preservada: versão 13.4.67.2, commit cdc62c4771d38f8d7d4b1370f66b8a6cbb8238ef; publicada no projeto sentinel-trading-lab, deployment dpl_358ZdCcBPJ1R91sAPzyyRdxdGqep. A 67.1 permanece disponível para rollback.

Hipótese investigada: aprender 32 pontos da trajetória em vez de 8, mantendo exatamente a direção do retorno entre entrada e vencimento. Protótipo independente em `adaptive-extremes-research.mjs`, não utilizado pelo Worker e não publicado.

64 cenários simulados: quatro sementes novas, ciclos/tendência/reversão/volatilidade, entrada em 30s e duração 30/60/120/300s. Tolerância de horário de topo/fundo: ±10s.

| Medida | 67.2 com 8 pontos | Pesquisa com 32 |
|---|---:|---:|
| Horário de topo dentro de ±10s | 48,44% | 50,00% |
| Horário de fundo dentro de ±10s | 48,44% | 51,56% |
| Erro médio do horário do topo | 52,78s | 51,69s |
| Erro médio do horário do fundo | 37,30s | 34,20s |

Direção CALL/PUT preservada nos 64 casos, verificada por assertivas. Em ciclos regulares, horário de topo 81,25%→87,50% e fundo 81,25%→93,75%; a melhora não se generaliza para tendência e volatilidade. O erro de preço do topo piorou ligeiramente. Resultados sintéticos e amostra pequena; não são taxas de operação real, não comprovam extremos resolvidos e NÃO autorizam publicação.

Decisão: pesquisa iniciada e comparação preservada; manter essa hipótese isolada. Mais pontos ajudam a resolução da trajetória, mas não resolvem as fraquezas do modelo em mudanças de regime. Nenhuma alteração na versão publicada.

Reprodução: `node scripts/sentinel-extremes-sampling-research.mjs result.json`.

A verificação pós-publicação confirma manifest 67.2, pacote/executável do commit publicado verificados no Windows, payload embutido correspondente, instalador 67.1 byte-idêntico, e manutenção da proteção de download por login/assinatura. Não foi usada sessão de cliente para baixar o EXE pelo fluxo autenticado.
