# Sentinel — previsão aos 30s com trajetória, velas e velocidade

## Resultado

O foco desta rodada foi exclusivamente o desfecho aos **30 segundos**. A referência publicada continua sendo a **13.9.23**; nenhum experimento foi instalado ou publicado.

A candidata de projeção da fase das oscilações, conservando os horários da publicada, passou de **9 favoráveis/5 desfavoráveis para 10 favoráveis/4 desfavoráveis: 64,3% → 71,4%** na extração mais precisa do vídeo. Foi um ganho líquido de um desfecho nos mesmos 14 resultados observáveis, com um sinal final sem desfecho em ambas. **Não atingiu 84% e apresentou regressões em testes de virada; não foi promovida.**

## Informação existente que não chega integralmente ao learner

A parte que aprende com exemplos históricos da 13.9.23 usa seis retornos entre pontos de preço: 2s, 5s, 10s, 20s, 32s e 60s. O percurso entre esses pontos não faz parte dessa representação. Logo, duas trajetórias podem possuir exatamente esses mesmos retornos e diferentes pavios, toques em limites e rejeições.

Um teste construído demonstra isso: altera-se um pico observado há 17s, sem mudar nenhum dos seis preços de referência nem o preço atual. Os seis retornos antigos ficam iguais, mas o pavio da janela anterior muda. Isso demonstra uma perda de informação da representação; não prova que qualquer inclusão dessa informação aumentará a taxa de acerto.

A leitura estrutural já possui parte dos conceitos de movimento, limites e reação. Porém, um learner autorizado pode substituí-la usando sua representação mais simples. Por isso, a auditoria precisa alcançar a decisão comum, não apenas os indicadores visíveis ou o nome da estratégia selecionada.

## Candidatas e comparações

Foram implementadas hipóteses fixas e causais, sem procurar parâmetros que produzam 84% no vídeo:

- **Tendência e fase de oscilação:** ajuste de linha ou linha mais uma componente periódica ao passado observado. Janela máxima de 180s; grade observada de 1s; pelo menos 60 pontos; períodos entre 12s e 90s, com pelo menos dois ciclos observados. A seleção usa erro penalizado por complexidade e quantidade de períodos pesquisados. A projeção é a diferença entre o modelo em agora+30s e agora, ancorada no preço real de entrada. O critério de ajuste não representa uma confiança calibrada.
- **Velas, limites e velocidade:** representação com 16 variáveis, incluindo os seis retornos, corpos e pavios de três janelas observadas de 10s, posição perante o intervalo histórico anterior à reação atual, recuo, aceleração e interação entre posição e velocidade. Regressão regularizada aprende diretamente o sinal do resultado aos 30s, usando somente desfechos já encerrados. A penalização foi fixada em 5, com pelo menos oito exemplos concluídos. Os exemplos sobrepostos não são observações independentes.

As velas desse estudo são reconstruções das cotações visíveis no vídeo, em janelas relativas de 10s. Não são os OHLC originais da corretora e podem perder extremos entre observações. Não foram inventadas cotações para preencher lacunas.

| Extração / versão | Favoráveis | Desfavoráveis | Sem desfecho | Taxa |
| --- | ---: | ---: | ---: | ---: |
| Corretora, seis casas: publicada | 9 | 5 | 1 | 64,3% |
| Corretora, seis casas: fase, mesmos horários | 10 | 4 | 1 | 71,4% |
| Corretora, seis casas: velas, mesmos horários | 9 | 5 | 1 | 64,3% |
| Card, cinco casas: publicada | 7 | 6 | 1 | 53,8% |
| Card, cinco casas: fase, mesmos horários | 10 | 3 | 1 | 76,9% |
| Card, cinco casas: velas, mesmos horários | 7 | 6 | 1 | 53,8% |

As duas extrações são o mesmo vídeo. Não foram combinadas como amostras independentes. A comparação em horários fixos conserva todos os sinais, sem excluir perdas ou introduzir novas esperas. Após os primeiros 180s, a candidata de fase obteve 8 favoráveis/2 desfavoráveis nas duas extrações: 80% nesse recorte. Isso não substitui o resultado integral de 71,4% da extração mais precisa nem comprova 80% fora dessa sessão.

Também foi testada a liberação de entradas pelo próprio modelo de fase, usando a publicada como alternativa quando o ajuste não estava disponível. Ela ficou em 11 favoráveis/6 desfavoráveis (64,7%) na extração mais precisa e 7/7 (50%) na extração do card. O ganho se concentrou na direção em horários já autorizados; liberar mais entradas não resolveu o objetivo.

## Robustez e limites que impediram a publicação

**Mudança de origem do relógio:** preservando preços e intervalos, deslocamentos de −1s a +1s fizeram a candidata de fase em horários publicados variar entre 53,8% e 71,4%. A própria publicada também alterou entradas. A projeção usa tempo relativo, mas herda a autorização por blocos do relógio da base. Não se escolheu um deslocamento favorável nem se concluiu que o relógio real do usuário estivesse incorreto.

**Mudanças de tendência:** em 21 caminhos gerados, com três sementes e sete famílias separadas, a candidata de fase conservou tendências fáceis e melhorou a família de oscilação regular, mas regrediu em viradas. Na família de subida seguida de queda, a referência teve 27 favoráveis/3 desfavoráveis e a candidata 20/10. A extrapolação pode continuar projetando uma onda que deixou de valer. A candidata de velas também apresentou regressão nessa família. Os caminhos gerados são diagnóstico de engenharia, não evidência de assertividade de mercado; não foram somados para divulgar uma taxa geral.

**Cálculo:** no replay mais preciso, o percentil 95 medido da candidata de fase que conserva entradas ficou na ordem de 2ms neste ambiente. Os tempos por modelo estão no JSON. Isso exclui rede, navegador, Windows e execução do usuário. Não houve mudança de agendador, cooldown ou confirmação por tempo no produto.

## Outro defeito reproduzível: descarte de histórico na entrada do runtime

O navegador pode fornecer até 6.800 observações. `setExternalMarket` conserva somente as últimas 2.400 para o motor atual. O tempo preservado, portanto, depende da frequência das cotações.

No diagnóstico gerado de 180s com 20 cotações/s, chegaram 3.601 observações, mas ficaram 2.400, cobrindo apenas 119,95s. O learner recebeu exemplos insuficientes para os contextos e desfechos necessários. Com o histórico completo, estava pronto e possuía 21 exemplos concluídos. A 40 cotações/s, o runtime conservou somente 59,975s e nem o contexto atual estava disponível. A 2 e 10 cotações/s, o histórico não foi cortado e o learner permaneceu disponível.

Isso demonstra um problema real de retenção no código, mas **a frequência efetiva dos ticks na sessão do usuário não está disponível**. Não se atribuiu esse diagnóstico à causa comprovada das perdas do vídeo. Nenhuma correção de retenção foi aplicada em produção nesta rodada; isso alteraria quais decisões são tomadas em feeds densos e requer sua própria comparação.

## Verificação e reprodução

**28 testes passaram.** Eles verificam previsão de 30s contrária à inclinação imediata em uma onda conhecida, preservação dos instantes de entrada, sinal único por 30s, ausência de influência de preços futuros e chegadas tardias, invariância da previsão a escala e origem do relógio, distinção dos pavios antes invisíveis e reprodução do corte de histórico na entrada do runtime. Os testes publicados anteriores também foram mantidos.

```bash
node research/thirty-second-objective-study.mjs > reports/sentinel-thirty-second-cycle-20261016.json
node research/thirty-second-objective-study.mjs --diagnostics > reports/sentinel-thirty-second-diagnostic-20261016.json
node research/thirty-second-objective-study.mjs --clock > reports/sentinel-thirty-second-clock-20261016.json
node --test tests/sentinel-thirty-second-objective.test.mjs tests/sentinel-expiry-objective.test.mjs tests/sentinel-base-deep-study.test.mjs tests/sentinel-video-consistency-20261016.test.mjs
git diff --exit-code a574f282 -- sentinel-trading-lab/agent sentinel-trading-lab/src sentinel-trading-lab/package.json
```

Os JSONs conservam os resultados piores, os recortes, todas as entradas e os diagnósticos. **Houve ganho parcial na mesma gravação, não uma solução comprovada de 84% ou eliminação do problema de reversões.**
