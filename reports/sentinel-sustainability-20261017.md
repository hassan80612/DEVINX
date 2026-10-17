# Sentinel: teste de sustentação após oscilações pequenas

Data: 17/10/2026. Base de produção: 13.9.33, commit `8df7b48bc1dad41e46bd6f14e2c9a95d443ec093`, árvore `4ff367daea2139c6e2e0aa665e30aaeab36f157c`.

**Resultado: não foi demonstrado ganho consistente de assertividade. Nenhuma destas experiências foi publicada. A 13.9.33 permanece em produção.**

## Candidato preservado para pesquisa

A última rejeição importante em um nível histórico não deve desaparecer apenas porque houve um pequeno pivô intermediário. O candidato procura a reação histórica mais recente entre os pivôs efetivamente recebidos. O nível precisa continuar intacto; uma reação importante mais recente e oposta impede resgatar uma anterior conveniente. A distância até a próxima barreira continua sendo exigida. A direção atual, o movimento observado e os mesmos critérios anteriores de eficiência permanecem necessários.

A mudança está somente em `observed-level-sequence.mjs`. O horizonte continua sendo 30 segundos. Não há novo relógio, consulta à corretora, espera fixa, coleta obrigatória, envio de ordens ou mudança em uma entrada já emitida. Uma continuação não cria admissão quando a decisão existente ainda não está qualificada. A projeção matemática e o seletor de resultados encerrados foram conservados exatamente como na produção.

Esse comportamento foi reproduzido em testes específicos espelhados para CALL e PUT: rejeição importante, pequeno recuo intermediário, retomada da direção, barreira próxima, perda do nível, reação importante oposta e lacuna de dados. O teste específico comprova a mudança de regra, não uma taxa de acerto no mercado.

## Comparação final

Foram usados os seis cenários artificiais anteriores e nove trajetórias artificiais adicionais: três famílias (recuos variáveis, mudanças de tendência e faixa com ruído), cada uma com as sementes 73471, 104729 e 20261017. O histórico OHLC é coerente com as cotações geradas. A decisão recebe somente velas fechadas e cotações já disponíveis. O resultado usa a cotação 30 segundos depois da emissão.

**Nos 15 cenários, o candidato final manteve os mesmos resultados da 13.9.33. Não houve ganho demonstrado de assertividade ou de frequência.** As comparações de instante e direção ficam nos arquivos JSON anexos. Não é apropriado agregar essas ondas artificiais como se fossem operações independentes de mercado.

| Cenário anterior | 13.9.33: acertos/erros | Candidato final: acertos/erros |
|---|---:|---:|
| Alta | 23/1 | 23/1 |
| Baixa | 24/0 | 24/0 |
| Oscilação regular | 20/1 | 20/1 |
| Oscilação variável | 19/4 | 19/4 |
| Viradas bruscas | 20/2 | 20/2 |
| Caminhada aleatória | 11/12 | 11/12 |

Os testes adicionais são comparações sintéticas de generalização, não um conjunto real independente. Algumas famílias e sementes foram observadas durante a pesquisa, portanto não são uma validação cega de mercado.

No vídeo original, o candidato final também mantém os mesmos instantes, preços e direções: 10 acertos, 4 erros e um vencimento ausente na extração de seis casas; 10 acertos, 3 erros e um vencimento ausente na extração de cinco casas. São duas leituras da mesma gravação. Ela não fornece as velas anteriores recebidas pelo Agent, necessárias para exercitar a nova regra histórica. Não foi inventado histórico anterior.

## Hipóteses rejeitadas

1. **Decaimento do desvio em relação à curva ajustada.** No vídeo de seis casas, o candidato caiu de 10/4 para 8/6. Na extração de cinco casas, caiu de 10/3 para 7/6. Código retirado. A comparação sintética inicial dessa hipótese não é usada como evidência, pois o harness ainda passava o seletor do candidato para ambos os lados; isso foi corrigido para que cada lado use seu próprio seletor.
2. **Exigir um novo fundo mais alto/topo mais baixo após recuperar o nível.** A investigação inicial considerou a ausência desse segundo pivô uma confirmação insuficiente. Os testes mostraram que a volta em V com quebra do pivô anterior também pode produzir sinais válidos. Tornar obrigatório o segundo pivô prejudicou algumas trajetórias. Por exemplo, em recuos variáveis com semente 73471, 17/7 virou 13/11. Em outros casos houve melhora pontual ou empate. Regra retirada; não foi introduzida uma espera pelo segundo fundo/topo.
3. **Encurtar a janela da curva após duas comparações retrospectivas fora da amostra de ajuste.** O vídeo principal caiu de 10/4 para 8/6; a extração mais grosseira caiu de 10/3 para 9/4. A regra também acrescentava custo de cálculo e piorou o cenário artificial de viradas bruscas de 20/2 para 19/3. Código retirado.

As alterações rejeitadas foram preservadas como patches de pesquisa. Os arquivos com `final-` no nome correspondem à experiência de confirmação estrita rejeitada; os arquivos `anchor-only-` correspondem ao candidato final. Essa distinção evita atribuir o resultado de uma hipótese a outra.

## Verificação e decisão

**265 testes passaram:** 253 da base e 12 novos casos de regressão. Foram verificados simetria, instante atual de entrada, prazo integral de 30 segundos, imutabilidade da chamada e preservação do espelhamento PC/celular.

A inspeção do código não encontrou nova espera ou acesso externo nesta mudança. Os tempos dos JSON são medições de CPU deste host; algumas comparações rodaram em paralelo e têm interferência de agendamento. Não medem atraso do navegador, latência da corretora ou desempenho no PC do usuário.

O candidato melhora uma distinção estrutural reproduzível, mas **os dados disponíveis ainda não mostram que ele reduza os erros reais**. Está salvo numa branch de pesquisa, sem substituir o motor publicado, sem novo instalador e sem anunciar aumento de porcentagem.

## Reprodução

```bash
node --test tests/sentinel-local-sustainability.test.mjs tests/sentinel-observed-level-sequence.test.mjs
node scripts/sentinel-multiscale-compare.mjs /caminho/da/13.9.33/agent/src/core sentinel-sustainability-anchor-only-reference.json intact-latest-major-anchor
SENTINEL_COMPARE_SEED=73471 node scripts/sentinel-multiscale-compare.mjs /caminho/da/13.9.33/agent/src/core sentinel-sustainability-anchor-only-73471.json intact-latest-major-anchor variable-pullbacks,trend-switches,noisy-range
node scripts/sentinel-observed-sequence-video.mjs /caminho/da/13.9.33/agent/src/core
```
