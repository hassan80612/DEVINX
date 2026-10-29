# Correções pontuais sobre a 13.9.168 publicada

Preparadas em 29/10/2026. Produção permanece na 168 original até a revisão do usuário. Esta branch não altera versão, instalador, domínios ou configuração do bot.

## Ponto de retorno

- Branch: `rollback/sentinel-13.9.168-stable-20261029`.
- Commit publicado: `569375cdfc00ab57d451919d10127501c8145016`.
- Árvore: `34a27c27e484959f9bd39324479a2a74fe763180`.
- Deployment: `dpl_he1a1S38K2MpFTjpJ6RbJqe7Aweh`.
- URL preservada: `https://sentinel-trading-fgo9y9p0b-iguassu-shop.vercel.app`.
- SHA-256 do payload publicado: `5033d8bbfb1e6f1637da989068ee57deeb565419495f222821a7adee37769224`.

A cópia usada como base foi conferida por hash contra todos os 1.085 arquivos da árvore publicada. As alterações anteriores que ainda estavam em investigação ficaram na outra worktree.

## Comportamento corrigido

As mensagens de mercado passam pelo atualizador de textos existente. Mudanças de fase têm prioridade nessa fila; não esperam o intervalo de 6–8 segundos da reconstrução completa do painel. A atualização mantém apenas a observação mais recente e verifica corretora, ativo, estratégia, prazo, idioma e estado. Um render antigo não pode sobrescrever uma observação mais recente. Essa via não altera recibos, gatilhos, permissão ou horário de entrada.

O texto principal mostra a leitura de continuidade, enfraquecimento ou reversão. A linha técnica informa idade da cotação e identifica quando a interpretação é a última leitura. Durante uma operação, o recibo principal continua preservado, com a interpretação atual na linha menor. O PC e o celular usam o timestamp da cotação realmente analisada.

A ingestão de ticker normaliza segundos, milissegundos, microssegundos e nanossegundos com o mesmo conversor já usado para candles. Frames antigos e futuros continuam rejeitados. Isto reproduz e corrige uma falha do parser; o ZIP não permite afirmar que o feed desta sessão utilizava a unidade afetada.

Uma continuidade contrária ao fluxo recente não passa somente porque esse fluxo enfraqueceu. Uma reversão com comprovação própria continua elegível. A distinção é compartilhada pelos três prazos; 5m conserva sua admissão exclusiva de reversões. A revisão de preço já existente também cobre 5m e conserva a prova própria de entrada atual. Não há novo estado de espera, segunda confirmação obrigatória, fila de candidatos ou rearme.

O diagnóstico de preço esticado conservava o código errado porque o espalhamento de `risk` sobrescrevia `entryTiming.kind`. O código agora distingue corretamente continuidade e reversão já esticadas na apresentação.

O detector da expiração nativa passa a reconhecer identidade em `data-testid`, `data-test`, `name`, `aria-labelledby` e valor em `aria-valuetext`. Abrir um botão de período/expiração não conta como selecionar seu valor atual. Uma opção explícita continua válida inclusive em menus internos. O período do gráfico salva a escolha antes de sair/recarregar e confirma logo depois do clique, sem aguardar o poll de 2,5s. Preferências de gráfico, expiração nativa e prazo do analista continuam separadas. Reparos não interferem em clique/ACK pendente.

## Comparação nos instantes registrados

Baseline: código publicado 168. A decisão recebe apenas o snapshot disponível naquele instante; o resultado posterior serve apenas de anotação.

| Arquivo de origem | Decisões | Vencedoras admitidas pela 168 e preservadas | Vencedoras adicionais descartadas | Perdedoras adicionais descartadas |
| --- | ---: | ---: | ---: | ---: |
| Sessão recente 168 | 14 | 8 | 0 | 1 |
| Sessão 160 | 75 | 40 | 0 | 0 |
| Sessão 164 | 3 | 1 | 0 | 0 |
| Sessão 167 | 3 | 1 | 0 | 0 |

A única mudança nestes snapshots é a 10ª entrada da sessão recente: CALL por continuidade contra um fluxo recente PUT enfraquecendo, sem reversão própria confirmada. Nenhuma direção foi invertida. Os 95 instantes gravados são de 1m. Eles não simulam as novas entradas que poderiam ocorrer depois de uma recusa e não demonstram ganho de assertividade futura. As outras cinco perdas recentes não foram artificialmente eliminadas por regras ajustadas apenas ao resultado conhecido.

## Verificações

- 756 testes de regressão passaram; build de produção e tipos passaram.
- Testes espelhados CALL/PUT para 30s, 1m e 5m: continuidade contrária sem prova, reversão própria, retomada normal e preço esticado.
- Chromium isolado: mensagens atualizadas durante cooldown, render antigo, ativo errado, separação de aviso técnico e nenhuma permissão de entrada concedida pela apresentação.
- Chromium isolado em Exnova e IQ Option: escolhas de 30s, 1m e 5m seguidas de reload imediato; controles sem classe semântica; gráfico separado; iframe; reconexão; proteção de clique ocupado; divergência conhecida de expiração.

Os testes de interface usam controles locais e não executam operações. No ZIP real, as 14 leituras nativas eram desconhecidas (`currentMs: null`). A correção amplia casos comprovadamente não reconhecidos e reproduz a falha de seleção do gráfico, mas não equivale a confirmar o controle específico da sessão real. O prazo nativo real deve ser conferido após instalar uma futura release; o valor solicitado de 60s não prova o vencimento aceito pela corretora.

Para repetir a comparação: `node scripts/sentinel-paired-entry-snapshots.mjs <diretório-core-da-168-publicada> <eventos.json> ...`. Para os testes de navegador, definir `SENTINEL_TEST_BROWSER` com um Chromium disponível. `SENTINEL_BASELINE_KEEPER` é opcional e aceita o URL `file:` do keeper publicado para reproduzir o detector anterior.
