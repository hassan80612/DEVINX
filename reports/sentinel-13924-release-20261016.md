# Sentinel 13.9.24 — avanço de direção em 30 segundos

Publicação autorizada pelo usuário: “Lança esse avanço”. Base: versão publicada 13.9.23, commit a574f282eebef6e0aeaca988cf5bc1c7d7d3db4e. O alvo é o projeto Sentinel Trading Lab e seu domínio trading.devinx.com.br.

## Alteração

A decisão comum de 30s pode usar a projeção de tendência e fase da oscilação ajustada somente às cotações já observadas. Foi promovida a candidata original de 71,4% no replay, sem as verificações posteriores de velocidade, desvio ou quebra de tendência que não mostraram melhora consistente.

A autorização, os horários e preços de entrada são conservados. O ciclo continua emitindo uma única chamada fixa durante os 30s, com análise contínua para a próxima entrada. Não foi acrescentado cooldown, espera por outra vela ou sinal automático de compra/venda. As políticas de 5s, 10s, 15s e 60s permanecem idênticas à 13.9.23.

## Evidência e limites

Na reconstrução mais precisa do vídeo do usuário, a referência teve 9 resultados favoráveis e 5 desfavoráveis; a candidata, nos mesmos horários, 10 favoráveis e 4 desfavoráveis: **64,3% → 71,4%**, ganho de 7,1 pontos percentuais. Um sinal final ficou sem desfecho em ambas. Na extração anterior do mesmo vídeo, a comparação foi 7/6 → 10/3, 53,8% → 76,9%.

São duas representações da mesma gravação, não sessões independentes. O resultado não comprova 71,4% ao vivo, nem a meta de 84%. A candidata ainda pode extrapolar uma onda que deixou de valer após uma virada. Essa limitação foi apresentada antes da autorização de publicação e permanece registrada na pesquisa.

Uma direção antiga favorável pode se tornar desfavorável. Na reconstrução do card às 13:53:20, a referência indica PUT e a projeção indica CALL, embora o preço termine abaixo aos 30s. Um teste novo registra explicitamente essa perda alternativa. O teste anterior dos dois PUTs favoráveis agora verifica a base de analogias conservada, antes da nova projeção; não foi apresentado como garantia de preservar toda direção anterior.

## Validação da entrega

- **213 testes obrigatórios passaram** em 43 arquivos, incluindo sete testes novos de integração e regressão da 13.9.24.
- O replay confirma os mesmos instantes de entrada e as contagens acima; o caminho real de ingestão, snapshot e decisão do runtime emite as mesmas chamadas e mantém a direção durante cada janela.
- As verificações cobrem cotações futuras, chegadas tardias, estratégias selecionadas e identidade das outras durações.
- Instalador Windows compilado com Go 1.24.9: 2.660.352 bytes na compilação local. Cabeçalho MZ, payload ZIP embutido, release e arquivos do motor conferidos contra o fonte.
- SHA256 do ZIP local: `1aa74b7cd8230f811045175824369eba7accb611cee0b9f8ec4461e0a5514956`. O build remoto recria o pacote e seu manifesto; o SHA publicado será conferido a partir do manifesto remoto.
- A entrega usa o build normal do projeto, que recompila o instalador e as duas URLs de download a partir da mesma release. Os binários locais não são enviados no commit de fonte.

O instalador foi compilado e inspecionado neste ambiente; não foi executado no Windows do usuário.
