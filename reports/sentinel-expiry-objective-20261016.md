# Sentinel — direção no vencimento, 30s e 60s

## Resultado desta rodada

A versão publicada continua sendo a **13.9.23**. Esta rodada produziu uma auditoria do objetivo da previsão, três variantes do uso dos exemplos históricos e uma projeção explícita de preço no vencimento. **Não produziu uma melhoria consistente nem demonstrou 80% de acerto. Nenhuma candidata foi publicada.**

O vídeo fornecido foi usado de novo, preservando as duas extrações existentes, suas lacunas e suas limitações. A leitura de 542 preços do card e a de 1.065 preços da corretora representam a mesma sessão. Não são sessões independentes e seus resultados não foram somados.

## Problema observado: direção imediata não equivale a direção no vencimento

Na reconstrução a seis casas, o sinal CALL iniciado aproximadamente às 13:50:50 de São Paulo estava favorável aos 5s, 10s e 20s, mas desfavorável aos 30s. Quatro outros sinais começaram desfavoráveis aos 5s e terminaram favoráveis aos 30s. Os horários pertencem ao replay reconstruído, não a recibos de ordens da corretora.

Portanto, conferir apenas se a cotação está indo na direção do sinal logo após a entrada não resolve o objetivo. A comparação desta rodada usa o preço de entrada e a primeira observação disponível no vencimento ou até 1s depois, contando separadamente empate e desfecho ausente.

## Auditoria do objetivo e da rota de 1 minuto

O learner da 13.9.23 escolhe CALL/PUT pelo sinal da média ponderada dos retornos históricos completos. A força usada para permitir essa escolha, porém, vem do desequilíbrio entre pesos de altas e baixas. A maioria dos exemplos pode subir pouco enquanto a minoria cai muito: o sinal de maior movimento médio pode ser o lado com menos desfechos favoráveis.

Isso apareceu em duas avaliações consecutivas da extração a seis casas, aproximadamente às 13:57:58,5 e 13:57:59. Cerca de 73,3% do peso dos exemplos favorecia CALL, mas o retorno médio apontava PUT. A força era 0,4665, acima do filtro existente de 0,4. **Nenhuma das duas avaliações abriu uma nova entrada**, pois já havia um sinal em andamento. Não se atribuiu a elas a causa das perdas do replay.

A auditoria também confirmou que a função local aceita calcular desfechos de 60s, mas o motor operacional só a chama em 30s. Em 60s, conserva a leitura estrutural. Isso é uma limitação do caminho atual de previsão; habilitar a chamada, por si só, não comprova melhora.

Para observar os pesos sem alterar decisões, o estudo instrumenta somente o retorno do learner. Seu SHA256 foi fixado em `e6ea685066815869455d92b30ca0322dd5a3505f03a93871f8d1449193cc3870`. Os testes conferem igualdade de todos os campos originais antes e depois da instrumentação.

## Hipóteses avaliadas

1. Usar o learner existente também em 60s, mantendo a direção por retorno médio.
2. Escolher a direção pela maioria ponderada dos desfechos no vencimento, conservando o filtro existente.
3. Usar a previsão por exemplos somente se a direção média e a maioria concordarem; caso contrário, conservar a leitura estrutural.
4. Ajustar uma dinâmica de preço AR(1) estável ao passado observado e projetar o preço para o vencimento de 30s ou 60s.

As primeiras três não alteraram os sinais de 30s deste replay. Em 60s, habilitar os exemplos gerou novas entradas, mas não melhorou a direção nos mesmos horários da publicada. Os resultados divergiram entre as duas extrações; a mudança não foi promovida.

Na quarta hipótese, a janela máxima continuou em 180s. O ajuste usa pares observados em uma grade relativa de 1s, deixa lacunas sem preenchimento e exige pelo menos 30 pares. A expectativa é calculada para o horizonte solicitado, sem tratar a projeção como certeza ou probabilidade calibrada. Essa hipótese simples possui uma limitação: a direção esperada fica acoplada entre 30s e 60s; ela não representa toda possível subida seguida de reversão.

## Projeção de preço: resultados com seis casas

| Modelo e horizonte | Favoráveis | Desfavoráveis | Empates | Sem desfecho | Taxa |
| --- | ---: | ---: | ---: | ---: | ---: |
| Publicada, 30s | 9 | 5 | 0 | 1 | 64,3% |
| Projeção, 30s | 6 | 10 | 1 | 1 | 37,5% |
| Publicada estrutural, 60s | 1 | 3 | 0 | 0 | 25,0% |
| Projeção, 60s | 6 | 2 | 0 | 1 | 75,0% |

Cada linha usa seus próprios ciclos sem sobreposição. O resultado de 60s da projeção repetiu 6 favoráveis/2 desfavoráveis na extração do card. Contudo, a comparação nos **mesmos horários** da publicada apresentou apenas 2 favoráveis/2 desfavoráveis em 60s e 8 favoráveis/6 desfavoráveis em 30s. Isso impede atribuir os 75% exclusivamente a uma melhora da direção.

Também foi variado o primeiro instante dos ciclos em incrementos de 5s, mantendo o mesmo modelo e as mesmas cotações. Os 12 grupos de 60s da extração da corretora variaram de **37,5% a 75%**. Esses grupos se sobrepõem entre si: não são 12 sessões e não podem ser somados. Nenhum foi escolhido para publicar ou para programar espera no produto.

Em 30s, o erro absoluto médio da previsão de preço também foi maior do que o de simplesmente usar o preço atual como referência para o vencimento. Em 60s, foi menor nesta pequena amostra. A diferença entre horizontes reforça a necessidade de avaliar cada vencimento separadamente.

## Verificações e preservação

- 22 testes passaram: regressões anteriores, instrumentação fiel, desfechos por horizonte, ausência de influência de preços futuros e chegadas tardias, ciclos sem sobreposição, comparação nos mesmos instantes, mudança de escala e origem do relógio, e grupos de sensibilidade separados.
- Os arquivos operacionais do Agent, do site e o package.json permaneceram iguais aos do commit publicado `a574f282`.
- Não foi acrescentado cooldown ou espera programada ao produto. Os tempos de cálculo da pesquisa são registrados por modelo no JSON; não representam latência do Windows, navegador ou corretora.
- Código, testes e resultados ficaram na linha de pesquisa, separados da versão publicada.

## Reproduzir

```bash
node research/expiry-objective-study.mjs > reports/sentinel-expiry-objective-20261016.json
node --test tests/sentinel-expiry-objective.test.mjs tests/sentinel-base-deep-study.test.mjs tests/sentinel-video-consistency-20261016.test.mjs
git diff --exit-code a574f282 -- sentinel-trading-lab/agent sentinel-trading-lab/src sentinel-trading-lab/package.json
```

O JSON conserva todas as decisões, o caminho após cada sinal, as comparações em horários fixos e os resultados de todos os grupos de sensibilidade. Esta rodada localizou uma inconsistência entre objetivos e quantificou limitações de horizonte, mas **não eliminou o problema de assertividade e não sustenta uma promessa de 80%**.
