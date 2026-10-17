# Sentinel: auditoria de quatro erros e seleção inicial de projeção

17/10/2026. **Candidato não publicado. Produção de referência: 13.9.33**, commit `8df7b48bc1dad41e46bd6f14e2c9a95d443ec093`.

## Resultado que pode ser afirmado

Na extração de seis casas do vídeo já conhecido, o caminho real do runtime passou de **10 acertos e 4 erros para 11 acertos e 3 erros**, com um vencimento ausente nos dois lados. Os 15 instantes de emissão, os preços de entrada e os vencimentos são exatamente iguais. Somente a entrada no segundo 83 da gravação mudou de CALL para PUT. Entre os 14 resultados definidos, isso equivale a 71,4% e 78,6% **somente neste replay**. Não é comprovação de assertividade ao vivo.

Na extração de cinco casas, todos os sinais permaneceram iguais: 10 acertos, 3 erros e um vencimento ausente. As duas extrações vêm da mesma gravação, não de sessões independentes. O vídeo é conhecido e foi usado na investigação; esta é uma análise retrospectiva, não uma avaliação cega.

## O mecanismo alterado

Antes de cinco comparações encerradas, o seletor mantinha a projeção base mesmo quando a projeção mais ampla apresentava um ajuste penalizado substancialmente melhor sobre as mesmas observações. No sinal do segundo 83, a base indicava CALL com período ajustado de 40 segundos. A alternativa indicava PUT com período de 56 segundos. A diferença do critério de ajuste era aproximadamente 69,12 a favor da alternativa, mas a escolha permaneceu na base porque havia somente uma comparação encerrada.

O candidato permite usar a alternativa durante essa fase inicial quando: ambas descrevem as mesmas observações e o mesmo horizonte; a diferença do critério penalizado ultrapassa 10; há observações além de um período e a solução não está no limite superior de 180 segundos. Esse limite é uma regra de seleção de modelo, não uma estimativa de chance de vitória.

A verificação de cobertura evita tratar um ciclo no limite de busca como identificado apenas porque ajustou melhor o passado. A versão inicial sem esse cuidado piorou uma trajetória triangular; a regra final preservou o resultado anterior nesse cenário. Quando já existem cinco comparações encerradas, a política anterior de seleção por resultados observados permanece igual.

**Somente `completed-expiry-direction.mjs` altera o motor.** Não foram alteradas as fórmulas das curvas, os suportes/resistências de 100 velas ou as regras da janela. Não há nova coleta, espera fixa, cronômetro, consulta à corretora ou ordem automática. A chamada continua imutável durante seus 30 segundos. As mesmas duas projeções já eram calculadas antes; o novo trecho compara os resultados disponíveis.

## Os quatro erros examinados

Os tempos abaixo são relativos à extração da gravação. As cotações são OCR de tela e não recibos de liquidação de ordens.

| Segundo | Sinal 13.9.33 | Entrada → cotação aos 30s | Diagnóstico reproduzido | Candidato final |
|---:|---|---|---|---|
| 83 | CALL | 0,843185 → 0,843175 | Escolha inicial manteve a curva de 40s apesar de ajuste penalizado mais forte da curva de 56s | PUT, acerto no replay |
| 146,5 | CALL | 0,843305 → 0,843255 | As duas curvas apontavam alta; a estrutura de faixa observava virada para PUT | Erro permanece |
| 406,5 | PUT | 0,842985 → 0,843085 | As duas curvas e o análogo selecionado apontavam queda, enquanto os movimentos observados de 2 a 60s eram de alta | Erro permanece |
| 437,5 | PUT | 0,843105 → 0,843155 | As curvas apontavam queda; a base de análogos apontava alta, mas usar essa base indiscriminadamente também desfazia acertos posteriores | Erro permanece |

Nos dois primeiros erros, houve deslocamento inicialmente favorável ao sinal antes de voltar durante o prazo. Não basta estar na direção certa nos primeiros segundos. Nos dois últimos, a projeção de queda falhou contra o avanço observado. Isso descreve a gravação; não prova que toda alta recente deva virar CALL.

O replay alimenta o runtime com `now` igual ao instante da cotação. Portanto ele não mede filas, latência da corretora ou atraso no PC do usuário. Não houve reconstrução das velas anteriores ausentes no vídeo.

## Comparação sintética final

São 15 trajetórias artificiais: os seis cenários anteriores e três famílias adicionais em três sementes. **Cinco melhoraram, uma piorou e nove mantiveram o número de acertos.** Não se trata de uma taxa de mercado. Todas mantiveram a quantidade de sinais. Uma das melhorias mudou dois instantes de entrada por interação com a análise histórica; ela não constitui ganho isolado apenas de direção.

| Trajetória artificial | Semente | 13.9.33: acertos/erros | Candidato: acertos/erros | Sinais antes/depois |
|---|---:|---:|---:|---:|
| uptrend | 1267 | 23/1 | 23/1 | 24/24 |
| downtrend | 1267 | 24/0 | 24/0 | 24/24 |
| regular-range | 1267 | 20/1 | 21/0 | 21/21 |
| changing-range | 1267 | 19/4 | 19/4 | 23/23 |
| sharp-turns | 1267 | 20/2 | 20/2 | 22/22 |
| random-walk | 1267 | 11/12 | 11/12 | 23/23 |
| variable-pullbacks | 73471 | 17/7 | 17/7 | 24/24 |
| trend-switches | 73471 | 11/12 | 12/11 | 23/23 |
| noisy-range | 73471 | 21/3 | 22/2 | 24/24 |
| variable-pullbacks | 104729 | 14/8 | 15/7 | 22/22 |
| trend-switches | 104729 | 11/13 | 11/13 | 24/24 |
| noisy-range | 104729 | 19/4 | 20/3 | 23/23 |
| variable-pullbacks | 20261017 | 16/8 | 15/9 | 24/24 |
| trend-switches | 20261017 | 8/16 | 8/16 | 24/24 |
| noisy-range | 20261017 | 16/7 | 16/7 | 23/23 |

A regressão não foi escondida: nos recuos variáveis com semente 20261017, 16/8 virou 15/9. Nos movimentos de alta, baixa, oscilações variáveis, viradas bruscas e caminhada aleatória da comparação original, o resultado permaneceu igual. A oscilação regular original passou de 20/1 para 21/0. Esses geradores já foram usados durante a pesquisa; os resultados são exploratórios e não garantem generalização.

## Regra rejeitada após validação

Uma segunda experiência priorizou a reversão de faixa observada contra a extrapolação de ciclo. O vídeo de seis casas chegou a 12/2, mas uma trajetória de mudança de tendência caiu de 11/12 para 6/17. Essa alteração foi retirada integralmente. O arquivo `now-opportunity-engine.mjs` do candidato final é idêntico ao da 13.9.33. Não se anuncia 12/2 como resultado do candidato conservado.

## Verificação e estado

**260 testes distintos passaram:** 253 casos da base e sete novos. A comparação de ingestão real do runtime foi atualizada para usar o seletor que o runtime efetivamente emprega, em vez da projeção crua sem seletor. Ela continua verificando todos os instantes, a imutabilidade da chamada e, explicitamente, a única troca de lado no vídeo e a contagem 11/3 com um vencimento ausente. Nenhuma verificação de horário ou de acerto antigo foi simplesmente removida.

Os novos testes verificam evidência penalizada inicial, cobertura de ciclo, ausência de admissão artificial, compatibilidade de amostras/horizontes, preservação da política madura, cotações futuras, escala, simetria CALL/PUT e prazo integral sem troca dentro da operação. As regressões existentes incluem PC/celular e durações de 5, 10, 15 e 60 segundos.

Os tempos de CPU nos JSON vieram deste host, com parte das comparações em paralelo; não medem o desempenho no Windows do usuário. A alteração não acrescenta cálculo de outra curva ou acesso externo.

O ganho demonstrado é **pontual na fase inicial da escolha de projeção**. Ele não resolve os três outros erros da gravação nem o problema geral de reversões rápidas durante uma sessão longa. O instalador e o site publicados continuam na 13.9.33, sem esse candidato. Uma publicação futura exige nova versão e reconstrução do Agent correspondente.

SHA256 do módulo candidato: `c6a759666506d54811a8dee9c9319928b6771e4853389b299420e574f9b1188a`.

## Reprodução

```bash
node --test tests/sentinel-bootstrap-fit.test.mjs tests/sentinel-13924-expiry-phase.test.mjs tests/sentinel-13929-adaptive-expiry.test.mjs
node scripts/sentinel-video-loss-audit-20261017.mjs /caminho/da/13.9.33/agent/src/core
node scripts/sentinel-observed-sequence-video.mjs /caminho/da/13.9.33/agent/src/core
node scripts/sentinel-multiscale-compare.mjs /caminho/da/13.9.33/agent/src/core sentinel-bootstrap-covered-final-reference.json covered-bootstrap-only
```
