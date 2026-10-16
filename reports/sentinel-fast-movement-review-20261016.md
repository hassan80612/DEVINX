# Sentinel: movimentos rápidos e alvo de vencimento

Base verificada: produção **13.9.28**, commit `a83ac46f40e448595070dc21511d3f9739708dc8`, deployment `dpl_AVULTRJPeGiyjEQChgzuE6BVFbyT`, manifesto público 13.9.28. Esta investigação parte dessa versão e **não publicou outro Agent nem substituiu o site**.

## O que foi encontrado e corrigido no código candidato

### 1. Mais atualizações apagavam o tempo de histórico

O coletor cortava a lista por quantidade de amostras e o runtime usava apenas as últimas 2.400. No mesmo caminho de preço de 180 segundos:

| Atualizações por segundo | Tempo retido antes | Comparação histórica de 30s antes | Depois |
|---:|---:|---|---|
| 2 | 180s | disponível | disponível, mesmos dados |
| 10 | 180s | disponível | disponível |
| 20 | 119,95s | exemplos concluídos insuficientes | disponível, 180s preservados |
| 40 | 59,975s | contexto insuficiente | disponível, 180s preservados |
| 100 | 23,99s | contexto insuficiente | disponível, 180s preservados |

A candidata limita o histórico pelo tempo decorrido: guarda observações reais de abertura, mínimo, máximo e fechamento em intervalos de 250ms, preservando o último tick e os metadados de recebimento. Não interpola, não cria preços e não espera terminar o intervalo para analisar. O arquivo de observações compactado cobre até cinco minutos; os modelos continuam usando seus próprios recortes. A coleta é compactada somente acima de 6.000 amostras; o runtime compacto possui no máximo 4.804 observações por cinco minutos. Entradas esparsas de até 2.400 observações mantêm o comportamento anterior. Não há nova leitura de DOM, pedido à corretora, assinatura, contador ou espera por vela.

Frequência de mensagens e velocidade do preço são variáveis diferentes. O defeito foi reproduzido aumentando apenas a frequência de mensagens. Isso não prova que o feed dos dez loss relatados tinha aquela frequência.

### 2. No sincronizado, o contador e a projeção tinham alvos diferentes

A 13.9.28 avisa em `:27` e prende o vencimento em `:00`, mas o modelo harmônico continuava projetando a cotação até `:57` (30 segundos após a cotação). Na candidata, essa projeção recebe o deadline verificado usado pelo próprio contador. O horizonte é calculado a partir do timestamp da cotação, incluindo a diferença entre a cotação e o momento do cálculo.

Um teste com uma oscilação observada, período de 40 segundos e fase fixa, reproduz preço abaixo da referência em `:57` e acima em `:00`. A direção passa de PUT para CALL quando o alvo correto é solicitado. O runtime real confirma a mesma entrada `:27`, preço de referência e deadline `:00`; o modo atual continua com PUT e prazo de 30 segundos nessa mesma observação. São evidências de consistência do alvo, não uma taxa de acerto de mercado.

Essa correção alcança a projeção harmônica quando disponível. A admissão estrutural/histórica de fallback foi preservada; não foi criada uma espera adicional pela disponibilidade da projeção. Não se afirma que todos os caminhos de fallback têm um modelo recalibrado para o prazo variável. O preço de referência continua sendo o observado na emissão do sinal; o analista não conhece nem altera preço e vencimento de um clique manual posterior.

### 3. O modelo ainda erra mudanças de ritmo e reversões

A busca harmônica publicada considera períodos de 12 a 90 segundos em 180 segundos de dados. Pode ajustar uma onda histórica e prolongá-la na direção errada depois de uma mudança de movimento. Preservar o histórico, isoladamente, torna a entrada de dados consistente, mas também pode reativar previsões ruins: não é uma correção suficiente da assertividade.

## Alternativas de direção, exclusivamente em pesquisa

Foram medidas três alternativas, sem importá-las no motor operacional:

1. Seleção por resultados de 30s concluídos entre a previsão publicada e uma tendência local de 20s. Reduziu erros em reversões geradas, mas piorou algumas tendências e uma leitura do vídeo; rejeitada como substituição direta.
2. Ampliação fixa da busca para períodos de 4 a 180s, exigindo ao menos um ciclo observado. Melhorou vários caminhos gerados, mas piorou o vídeo: de 10/4 para 8/6 na leitura mais precisa, e de 10/3 para 6/7 na leitura menos precisa. Rejeitada como substituição direta.
3. Comparação causal entre o modelo publicado e a busca ampliada: previsões de sombra a cada 5s, atualização só quando o resultado de 30s foi observado no máximo 1s após o alvo, descarte de empates/observações tardias, perda binária exponencial com peso novo 0,2, mínimo de cinco resultados concluídos e margem de 0,1 para substituir a base. Não é probabilidade de acerto. Não cria admissão, espera de entrada ou mudança de lado de uma operação ativa.

A terceira é a candidata mais promissora desta rodada. Os parâmetros são exploratórios e os caminhos gerados não são uma validação independente de mercado.

### Vídeo do usuário

| Leitura do mesmo vídeo | Publicado, horários livres | Seleção causal ampliada |
|---|---|---|
| Corretora, 6 casas, 2Hz | 10 acertos / 4 erros / 1 desconhecido: 71,4% | mesmos horários, lados e resultados |
| Card, 5 casas, 1Hz | 10 acertos / 3 erros / 1 desconhecido: 76,9% | mesmos horários, lados e resultados |

As duas leituras não são amostras independentes. A medição usa a primeira cotação observada até 1s após o vencimento, sem interpolação. Os desconhecidos não entram no percentual. Esse replay usa horários livres de 30s: **não representa a assertividade da regra sincronizada de :27**, não contém a sequência nova de dez loss e não comprova melhora real de 71,4% para 90%.

### Diagnósticos gerados: resultados por regime

Três sementes fixas (1013, 1019, 1021), decisões comparadas nos mesmos instantes de três fases de 30s (0, 7, 17s), depois de 180s. As fases são sequências separadas; elas possuem resultados sobrepostos e não devem ser tratadas como operações independentes. A tabela usa a taxa de 2Hz, que preserva o contexto também na versão publicada; assim, isola a direção da correção da retenção.

| Caminho gerado | Base: acertos/erros | Seleção ampliada: acertos/erros | Sem admissão, ambos |
|---|---:|---:|---:|
| Tendência lenta | 102/0 | 102/0 | 0 |
| Tendência com oscilação rápida | 58/19 | 67/10 | 25 |
| Oscilação rápida regular | 79/16 | 93/2 | 7 |
| Oscilação com frequência variável | 42/32 | 42/32 | 28 |
| Reversões bruscas | 12/69 | 63/18 | 21 |
| Mudança de volatilidade | 50/25 | 58/17 | 27 |

Na sequência de reversões geradas, a maior série de erros de uma mesma fase caiu de 11 para 2. Isso reproduz uma classe de fragilidade, **não reproduz nem explica comprovadamente os dez loss reais do usuário**. As taxas de mensagens de 40Hz foram medidas em separado no JSON. Restaurar o histórico muda quais decisões têm admissão; por isso, os percentuais esparsos da versão truncada não devem ser apresentados como comparação equivalente de assertividade. Não se somam regimes nem se anuncia uma taxa geral de 90% a partir desses dados.

## Verificação e custo

- **238 testes passaram**, em 47 arquivos: regressões obrigatórias da produção e testes novos de ingestão real de protocolo IQ Option/Exnova, preservação dos extremos, memória, metadados, alvo de projeção e ausência de preços futuros na seleção. Tipagem TypeScript passou.
- Os testes do vídeo continuam reproduzindo as mesmas entradas, lados fixos e resultados do modo atual.
- Os testes existentes de sincronizado continuam verificando aviso em `:27`, vencimento fixo, descarte de entrada atrasada, PC → celular e ausência de leitura pesada da página para obter o relógio.
- Ingestão local de 6.000 observações: p50 0,382ms, p95 0,857ms, máximo 1,733ms em 100 medições após aquecimento. É apenas Node local, não mede Windows, rede, corretora ou renderização.
- No estudo gerado, modelo-base mais busca ampliada e seleção tiveram p95 aproximadamente 7–11ms. Essa candidata é mais cara que o modelo atual; não foi integrada ao ciclo operacional de 80ms. Os timers e a cadência da produção foram preservados.

## Situação final

As correções de retenção e do alvo sincronizado estão implementadas em branch de pesquisa baseada na 13.9.28. As alternativas de direção e todos os resultados positivos e negativos estão registradas para revisão. **Nada desta rodada foi publicado. A assertividade nos movimentos rápidos ainda não está resolvida nem validada em 90%.** Para verificar a sequência real atual, é necessário observar um trecho novo com as perdas, o ativo, a duração, o modo de relógio e a versão do Agent visíveis; o vídeo anterior permite apenas conservar a comparação anterior.

Reproduzir: `node research/fast-feed-study.mjs`; `node research/fast-model-video-study.mjs`; testes adicionais em `tests/sentinel-fast-*.test.mjs` e `tests/sentinel-synced-projection-target.test.mjs`.
