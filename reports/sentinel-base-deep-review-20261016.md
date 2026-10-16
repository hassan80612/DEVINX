# Sentinel — publicação e investigação do motor base, 16/10/2026

## Resultado

A **13.9.23 foi publicada** e preservada. A investigação posterior avaliou **12 alternativas offline da base comum**. **Nenhuma demonstrou a meta de mais de 70% com vantagem consistente.** Nenhum experimento substituiu a versão publicada.

O vídeo foi suficiente para reproduzir falhas, preparar a correção publicada e confrontar novas hipóteses. Os resultados abaixo documentam os testes executados. A meta permanece não atingida.

## Publicação conferida

- Domínio: https://trading.devinx.com.br
- Deployment READY: dpl_CLw17WAJirR13h2AWpRquWpSWtYB
- Código preservado: commit a574f282eebef6e0aeaca988cf5bc1c7d7d3db4e, branch release/sentinel-13.9.23.
- A linha anterior de produção também foi atualizada para esse commit, evitando que o próximo ajuste comum apague a correção.
- Download público do instalador: HTTP 200, arquivo Windows válido, 2.658.816 bytes.
- O ZIP embutido foi extraído e conferido: release 13.9.23 e arquivo do motor idêntico ao código revisado. SHA256 do ZIP publicado: db43063018d67a6f2c6408c6a22a0f365f011cba2d164bd3daad4181181f6d3e.
- Os testes obrigatórios e a compilação do site/instalador concluíram na publicação. A verificação local anterior aprovou 210 testes.
- O filtro de erros/fatais consultado no deployment não encontrou registros; isso não equivale a observar uma sessão completa no computador do usuário.

## Dados mais precisos do mesmo vídeo

Além das 542 observações do card arredondadas a cinco casas, extraí **1.065 preços da própria corretora, a cada meio segundo quando legíveis, com seis casas decimais**. Mantive as falhas de leitura como lacunas, sem interpolar. Uma leitura OCR foi corrigida após inspeção da imagem: frame 1091, 0,849785 → 0,842785.

Essas duas extrações são representações do **mesmo vídeo**, não duas sessões independentes. O relógio de origem é aproximado ao segundo, e faltam os ticks originais e o contexto anterior à gravação.

| Extração | Anterior à correção | Publicada 13.9.23 |
| --- | --- | --- |
| Card, cinco casas / 1Hz | 5 favoráveis, 6 desfavoráveis, 3 empates: **45,5%** | 7 favoráveis, 6 desfavoráveis, 1 sem desfecho: **53,8%** |
| Corretora, seis casas / 2Hz | 8 favoráveis, 6 desfavoráveis, 1 sem desfecho: **57,1%** | 9 favoráveis, 5 desfavoráveis, 1 sem desfecho: **64,3%** |

As taxas excluem empates e sinais sem observação no vencimento. São movimentos observados de preço, não recibos de liquidação de ordens. Não foram combinadas as extrações para inflar a amostra, nem escolhido um novo resultado para substituir silenciosamente a comparação anterior.

## O que foi investigado

A base usa a mesma decisão para todas as opções visíveis. A mudança de estratégia selecionada não fornece uma segunda prova independente. Foram investigados: contexto mais longo, regime e posição no intervalo, regressão causal, sobreposição dos desfechos, recência, horário usado na liquidação histórica, direção de fluxo, separação entre instante e direção, e dependência de blocos fixos do relógio.

Para cada cotação, o modelo recebeu somente o passado já observado. Os desfechos só foram usados depois dos 30s. Cada modelo manteve seus próprios ciclos, sem sinais sobrepostos. Também fiz comparação nos **mesmos horários da publicada**, contando abstenções separadamente, para não atribuir um ganho de timing a uma melhoria da direção.

### Replay com seis casas: todas as alternativas

| Hipótese | Favoráveis | Desfavoráveis | Empates | Sem desfecho | Taxa | Sinais | Espera extra mediana após vencer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Publicada 13.9.23 | 9 | 5 | 0 | 1 | 64,3% | 15 | 1s |
| Janelas e amostragem relativas | 7 | 6 | 1 | 1 | 53,8% | 15 | 2.5s |
| Apenas amostragem relativa | 7 | 6 | 1 | 1 | 53,8% | 15 | 2.5s |
| Apenas estrutura relativa | 6 | 7 | 0 | 1 | 46,2% | 14 | 0s |
| Contexto e vizinhos independentes | 6 | 7 | 1 | 1 | 46,2% | 15 | 1s |
| Regressão causal regularizada | 7 | 7 | 0 | 2 | 50,0% | 16 | 0.5s |
| Vencimento histórico corrigido | 9 | 5 | 0 | 1 | 64,3% | 15 | 1s |
| Desfechos históricos não sobrepostos | 9 | 5 | 0 | 1 | 64,3% | 15 | 1.5s |
| Peso maior para desfechos recentes | 8 | 6 | 0 | 1 | 57,1% | 15 | 1s |
| Desfechos independentes e recentes | 8 | 6 | 1 | 1 | 57,1% | 16 | 1s |
| Fluxo dos últimos 30s | 6 | 8 | 3 | 1 | 42,9% | 18 | 0s |
| Fluxo suavizado rápido/lento | 9 | 7 | 1 | 1 | 56,3% | 18 | 0s |
| Entrada publicada com direção do fluxo | 7 | 7 | 0 | 1 | 50,0% | 15 | 1s |

Nenhum teste nessa tabela ultrapassou 70%. A regressão contextual absteve-se em cinco dos 15 horários da comparação fixa e ainda não superou a publicada.

## Instabilidade com o relógio

Deslocar **todos os horários** da reconstrução, preservando preços, intervalos e causalidade, mudou as entradas da versão publicada. Na extração com seis casas, o resultado variou de 50,0% a 64,3% para deslocamentos entre −1s e +1s. Isso revela sensibilidade dos blocos de 5/10s e da grade histórica de 4s; não comprova que o relógio real do usuário estivesse errado.

A candidata de janelas relativas eliminou essa dependência: teve o mesmo resultado nos cinco deslocamentos. Contudo, caiu para 7 favoráveis/6 desfavoráveis, **53,8%**, e aumentou a maior sequência de perdas para cinco. As duas partes da alteração também foram avaliadas separadamente. **Não foram promovidas.** Melhorar uma propriedade técnica isolada não autoriza afirmar melhora de assertividade.

## Velocidade

Não acrescentei cooldown, confirmação por tempo ou espera por novas velas à publicada. A pesquisa mede separadamente o custo de cálculo e o tempo sem nova entrada depois de um vencimento: um modelo rápido no processador ainda pode deixar o analista muito tempo esperando uma condição.

Carga gerada exclusivamente para medir o cálculo da base publicada neste ambiente:

| Cotações na carga | Mediana | Percentil 95 | Máximo |
| --- | ---: | ---: | ---: |
| 360 | 0.340 ms | 0.682 ms | 3.957 ms |
| 3600 | 2.554 ms | 3.279 ms | 5.128 ms |
| 6800 | 2.076 ms | 2.629 ms | 3.545 ms |

O agendador existente continua com intervalo de 80ms. Essas medições não incluem corretora, rede, navegador, computador Windows ou card do celular.

## Verificação além do vídeo

Foram comparados 56 caminhos gerados de sete famílias, com novas sementes e resultados separados por regime. Os dados gerados são diagnósticos, **não evidência de 70% em mercado**. Os caminhos direcionais são fáceis para muitos modelos; as taxas altas nesses grupos não podem ser apresentadas como assertividade comercial. A regressão causal, os vizinhos contextualizados e a troca pela direção de fluxo tiveram regressões relevantes em outras famílias.

Os testes novos verificam: ausência de influência de preços futuros, chegada tardia de dados, lacunas não preenchidas, ciclos sem sobreposição, horários idênticos na comparação e invariância da candidata relativa à origem do relógio. Os arquivos operacionais do Agent e do site permaneceram iguais aos da 13.9.23 publicada.

## Como reproduzir

```bash
node research/base-direction-study.mjs
node research/base-direction-validation.mjs
node research/base-direction-latency.mjs
node --test tests/sentinel-base-deep-study.test.mjs tests/sentinel-video-consistency-20261016.test.mjs
```

Os JSONs na pasta reports preservam todos os resultados, inclusive as alternativas piores, a comparação em horários fixos, a perturbação do relógio e os testes de cada parte da alteração.

## Critério técnico para comparar a próxima alteração

Uma próxima versão precisa superar a publicada em dados observados fora do trecho usado para escolher a regra, manter a cobertura das entradas e não aumentar a demora do analista. Uma taxa isolada acima de 70% obtida escolhendo horários, excluindo perdas ou somando simulações não satisfaz esse critério. **Não há uma versão superior a 70% comprovada para publicar ao fim desta investigação.**

Referências de método: [validação sequencial com alvos atrasados, River](https://riverml.xyz/latest/api/evaluate/progressive-val-score/) e [separação temporal de treino e teste com gap, scikit-learn](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html).
