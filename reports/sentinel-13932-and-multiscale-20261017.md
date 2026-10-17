# Sentinel: publicação 13.9.32 e comparação entre níveis de velas

## Resultado publicado

- URL: https://trading.devinx.com.br
- Versão: **13.9.32**, produção, **READY**.
- Commit: `ab91fab743ab52763d73fbd21d36802c60868e42`.
- Deployment: `dpl_CX947CwvF3i1TiQ7MZJqyXWspuNh`.
- Framework: Next.js 15.5.27. Construção: aproximadamente 67 segundos.
- Alteração: suporte e resistência são confrontados com a projeção efetivamente escolhida pelo seletor, em vez de uma projeção anteriormente descartada.
- O processo de construção executou os testes exigidos e gerou o instalador correspondente. Os 30 testes locais focados na correção, ciclo de sinal e compatibilidade também passaram.
- EXE: https://trading.devinx.com.br/downloads/Sentinel-Agent-13.9.32.exe
- Alternativa: https://trading.devinx.com.br/downloads/Sentinel-Agent-13.9.32-Alternativo.zip

O EXE baixado contém exatamente o pacote conferido no ZIP alternativo. O hash corresponde ao manifesto de atualização, e o código do motor extraído corresponde ao código revisado. A resposta HTTP parcial foi 206 com os bytes esperados. Isso verifica a entrega e a identidade do pacote; não substitui uma execução nativa em Windows ou garante a política de download de cada navegador.

Na consulta inicial, limitada a este deployment, não apareceram logs de erro ou fatal. Não foi realizada uma avaliação prolongada de disponibilidade ou um inventário de monitoramento externo.

## O exemplo do usuário

Romper o nível recente não determina que o movimento continuará atravessando todos os níveis seguintes. O preço pode atravessar um fundo próximo e encontrar outro fundo importante formado muitas velas antes. Nesse segundo nível, é necessário distinguir passagem, sustentação além da região e rejeição observada. O mesmo raciocínio vale para uma alta até resistências sucessivas.

Dez acertos em catorze resultados definidos correspondem a **71,4%**, não 60%. Esse número descreve um replay curto do motor, e não a assertividade comprovada do produto em novas sessões.

## Implementação adicional, não publicada

Foi preparado um candidato que mantém o mesmo caminho comum das estratégias e acrescenta:

1. Janelas explícitas de **3, 10, 20, 50 e 100 velas fechadas recebidas**. Janelas sem dados suficientes são marcadas como indisponíveis.
2. Identificação dos próximos níveis na direção analisada, preservando níveis antigos depois da passagem por níveis próximos. Quando existe uma projeção numérica, registra quais níveis estão antes de seu destino previsto.
3. Contagem de testes independentes: velas adjacentes junto ao nível não viram automaticamente vários testes. Um afastamento completo e retorno constituem um novo teste.
4. Pivôs confirmados com velas fechadas dos dois lados, proporção de pavio e corpo e reação dos preços atuais. Não usa uma vela futura para confirmar um pivô no passado.
5. Rejeição observada apoiada nas velas pode ter precedência sobre a extrapolação. Ao substituir uma projeção contrária, retira seus valores numéricos incompatíveis e registra a divergência.
6. Recalcula os próximos níveis na direção da nova decisão: ao reagir para cima em um suporte antigo, a resistência seguinte passa a ser considerada no caminho de subida.

Não foi acrescentado temporizador de confirmação, requisição adicional à corretora, leitura de relógio ou espera para coletar 100 velas novas. A estrutura das velas é calculada em cache; a reação atual usa a cotação fresca. Uma chamada já emitida continua imutável até seu vencimento original.

Treze testes novos passaram, incluindo rompimento do nível próximo seguido de rejeição no nível antigo, passagem sustentada pelo segundo nível, comportamento simétrico em resistências, contexto de três velas, ausência de dados futuros, lacunas, cache e ciclo único. Um teste no runtime real emite a rejeição de três velas com 14 segundos de cotações já disponíveis e preserva os 30 segundos completos de operação. Isso demonstra funcionamento do mecanismo; **13 testes aprovados não significam 100% de acertos no mercado**.

Também passaram as regressões pertinentes de estrutura, seletor de vencimento, autenticação, renderização móvel, frescor e ciclo do sinal. A execução inicial de alguns testes parou por dependências de desenvolvimento ausentes; depois de instalar as dependências declaradas, os testes afetados foram aprovados. Não foi alterado teste para aceitar uma falha.

## Comparação sintética de 30 segundos

Os dois motores receberam preços e OHLC coerentes entre si. Cada decisão utilizou somente preços já observados e velas já fechadas. A operação de 30 segundos começou no instante de emissão. São seis trajetórias artificiais de 12 minutos cada, com histórico anterior construído para o teste. **Não são novos dados de mercado nem comprovação da taxa real do produto.**

| Trajetória artificial | Produção 32: acertos / erros | Candidato de níveis: acertos / erros |
|---|---:|---:|
| Tendência de alta | 23 / 1 | 23 / 1 |
| Tendência de baixa | 24 / 0 | 24 / 0 |
| Oscilação regular | 20 / 0 | 20 / 0 |
| Oscilação variável | 16 / 6 | 16 / 6 |
| Viradas bruscas | 7 / 15 | 7 / 15 |
| Caminhada aleatória com semente fixa | 9 / 13 | 10 / 13 |

O candidato resolveu os casos funcionais de níveis encadeados, mas **não reduziu os 35 erros totais dessa comparação**. Emitiu uma operação adicional vencedora na caminhada aleatória. Os denominadores diferentes impedem interpretar esse resultado como um ganho isolado de direção. As viradas bruscas continuam sendo um ponto fraco relevante.

Nessa execução, o tempo médio de avaliação do candidato ficou entre aproximadamente 4,2 e 6,2 milissegundos por trajetória; o percentil 95 ficou entre 7,3 e 10,8 milissegundos. Os números incluem o seletor adaptativo e correspondem a esta máquina, não ao computador do usuário. Não foi observada uma espera artificial em segundos.

## Hipótese rejeitada

Também foi testado permitir ao seletor comparar a estrutura original com as duas projeções, usando somente vencimentos já concluídos. O replay principal permaneceu em 10 acertos e 4 erros. A segunda extração do mesmo vídeo piorou de 10 acertos e 3 erros para 8 acertos e 5 erros. A hipótese foi removida do código candidato; seu patch e seus resultados foram preservados como registro da rejeição. Não foi publicada nem ajustada repetidamente para atingir uma porcentagem desejada no vídeo.

## Estado final e limites

**A 13.9.32 está publicada. O candidato de múltiplas janelas permanece em pesquisa, sem publicação.** A correção publicada elimina uma incoerência demonstrada de integração. A nova leitura de velas já funciona nos testes, mas ainda não comprovou uma melhora consistente de assertividade.

O vídeo disponível não contém as 100 velas anteriores recebidas na sessão, ticks completos ou liquidações da corretora. Não seria correto fabricar esse contexto para anunciar ganho real. Eliminar qualquer erro de direção ou garantir 84–90% de acertos não é um resultado sustentado por estes testes.

## Arquivos e reprodução

- `sentinel-13932-publication-20261017.json`: identidade dos arquivos publicados e verificações.
- `sentinel-multiscale-synthetic-20261017.json`: comparação do candidato mantido.
- `sentinel-original-structure-expert-video-20261017.json` e `sentinel-original-structure-expert-synthetic-20261017.json`: hipótese rejeitada.
- `research/rejected-original-structure-expert-20261017.patch`: mudança experimental retirada, aplicável à cópia de pesquisa.

```sh
node --test tests/sentinel-multiscale-level-chain.test.mjs
node scripts/sentinel-multiscale-compare.mjs /caminho/absoluto/da/versao32/agent/src/core
```

O segundo comando exige a pasta do motor 32 para comparar duas implementações distintas. O script não conecta à corretora e não envia ordens.
