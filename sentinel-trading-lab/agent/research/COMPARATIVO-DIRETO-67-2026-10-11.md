# Sentinel 13.4.67 — auditoria de pesquisa, 11/10/2026

## Regra de segurança

**NÃO PUBLICAR / NÃO SUBSTITUIR A 13.4.67.**
A versão de produção e os nove motores permanecem inalterados. Todos os módulos novos são estudos locais (shadow), não estão ligados a ordens, CALL/PUT operacional, cartões, website ou banco de dados. Ninguém deve interpretar os percentuais abaixo como taxas comprovadas de operações reais.

Base aprovada: commit `5c20afbef3060d00a5caa52cf0498aebff6b20c9`.
Branch de pesquisa: `sentinel-13467-direct-paired-ridge-research-20261011`.

## O que foi experimentado

1. Original 13.4.67 — estima duas posições de preço separadamente e calcula direção futura de T+H até T+2H.
2. Autocorreção simples anterior — aprende o erro da previsão do mesmo motor, ativo e prazo, depois que preços de entrada e vencimento são observados.
3. Combinação adaptativa anterior — encolhimento/aprendizado contínuo de contribuição sobre a própria 67.
4. **Novo modelo direto** — regressão ridge regularizada do erro para retorno observado entre FUTURA entrada T+H e saída T+2H, com regime/volatilidade relativos a H.
5. **Nova combinação causal de correções** — regressão ridge de pesos sobre as correções simples e direta observadas em PREVISÕES ANTERIORES (não escolhe vencedora olhando resultado).

Nenhum modelo avaliado recebe cotações posteriores ao instante da previsão, nem resultados de operações ainda não encerradas. Preços de entrada e vencimento precisam ter carimbo dentro de 1.100 ms. Treino purga janelas de resultado que se sobrepõem. Análise sempre feita por motor e horizonte, sem votos entre estratégias. Os cinco modelos viram exatamente os mesmos snapshots nos testes comparativos.

## Teste A: vários mercados artificiais e todos os prazos

Cenários: tendência, oscilação, reversão, falso rompimento e volatilidade variável, dois seeds. Nove motores; prazos 5, 10, 30, 60, 120 e 300 segundos. **4.230 previsões avaliadas cronologicamente**.

| Modelo | Acertos | Taxa matemática simulada |
| --- | ---: | ---: |
| Original 67 | 2.554 | 60,4% |
| Autocorreção simples | **2.604** | **61,6%** |
| Antiga combinação adaptativa | 2.565 | 60,6% |
| Nova previsão direta | 2.550 | 60,3% |
| Nova combinação causal | 2.558 | 60,5% |

**Por prazo — original / direto / combinação causal, número de acertos:**

| Entrada após | N | Original | Direto | Combinação |
| --- | ---: | ---: | ---: | ---: |
| 5s | 720 | 465 | 449 | 466 |
| 10s | 720 | 415 | 442 | 415 |
| 30s | 720 | 430 | 413 | 425 |
| 60s | 720 | 473 | 468 | 470 |
| 120s | 720 | 428 | 435 | 439 |
| 300s | 630 | 343 | 343 | 343 |

A previsão direta resgatou 103 erros da 67 e criou 107 novos erros neste conjunto. A combinação causal resgatou 22 e criou 18, sem ganho relevante total. O prazo de 300s nesta série foi curto para ensinar suficientes resultados independentes ao modelo direto.

## Teste B: cronologia mais longa para 120s e 300s

Cenários: oscilação, falso rompimento e choque de volatilidade, um seed; todos os nove motores e dois prazos, 540 previsões avaliadas.

| Modelo | Acertos | Taxa simulada |
| --- | ---: | ---: |
| Original 67 | 268 | 49,6% |
| Autocorreção simples | 295 | 54,6% |
| Antiga combinação adaptativa | 271 | 50,2% |
| Direto | **298** | **55,2%** |
| Nova combinação causal | 266 | 49,3% |

Em 300s: original 105/270; autocorreção simples 146/270; direto 137/270; nova combinação 103/270.

**Interpretação:** melhorar um único tipo de mercado não prova melhora generalizada. A correção direta foi melhor nas séries longas, mas isso não bastou para superar a 67 no primeiro conjunto. A combinação causal não aproveitou bem as vantagens. Não deve ser promovida.

## Validade e limitações

- Dados **gerados artificialmente**, não extraídos da IQ Option/Xnova. Não há dados completos de operações com resultado financeiro.
- Várias previsões correlacionadas entre nove motores sobre a mesma série de preços: **4.230 NÃO são 4.230 oportunidades estatisticamente independentes**.
- Pesquisa baseada em poucos cenários artificiais e seeds; pode não generalizar para OTC.
- Testes confirmam propriedades de software (regressão original, causalidade, isolamento, contagens) e não rentabilidade nem uma probabilidade de acerto de 75–90%.
- Para decidir incorporar qualquer parte, usar diário local de cotações reais em DEMO, múltiplos ativos e dias distintos, validação cronológica retida fora do ajuste, comparação por motor/prazo e lucro líquido por payout. Nenhuma correção deve ser adotada após escolher retrospectivamente a melhor condição.

## Arquivos

- `src/core/vnext-direct-paired-ridge-research.mjs`
- `src/core/vnext-causal-two-corrections.mjs`
- `tests/sentinel-v13467-direct-paired-ridge.test.mjs`
- `tests/sentinel-v13467-causal-two-corrections.test.mjs`
- `tests/sentinel-v13467-direct-paired-compare.test.mjs`
- `.github/workflows/sentinel-direct-paired-ridge-research.yml`

**Decisão técnica: manter 13.4.67 publicada; não alegar melhoria global comprovada.**
