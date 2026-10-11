# Sentinel 13.4.70 — qualificação realista da correção dos nove motores
**Data:** 2026-10-11  
**Estado:** CANDIDATO DE PESQUISA, **NÃO AUTORIZADO PARA PRODUÇÃO**.

## Base preservada e caminho de rollback

- Produção 13.4.67: branch `sentinel-13467-future-entry-timing-20261010`, SHA `5c20afbef3060d00a5caa52cf0498aebff6b20c9`.
- Candidato independente 13.4.70: branch `sentinel-13470-nine-engines-structural-research-20261011`.
- Cópia exata das quatro fontes de previsão da 67 em `agent/src/core/research-baseline-13467/`, usada diretamente nos testes com mesma cotação e mesmo instante de entrada/saída.
- **Nenhum deploy de produção, nenhum overwrite de downloads públicos, nenhum botão do PC/mobile alterado e nenhuma alteração de Supabase.** PR permanece draft.
- Preview branch já passou build Next; Agent Windows compilado como artefato separado, verificado sem instalar (modo SENTINEL_INSTALL_VERIFY_ONLY).
- Para rollback operacional, continuar usando o deploy de produção do SHA acima; não mesclar candidato até haver resultado suficiente.

## Nove melhorias independentes — **fórmulas diferentes**

| Motor | Problema no código anterior | Alteração candidata |
| --- | --- | --- |
| Automático | Inclinações e níveis não quantificavam desaceleração, variância recente ou qualidade estatística | R² temporal, desaceleração, volatilidade local, pivôs confirmados e equilíbrio OU apenas se estável |
| Price Action | Pernas feitas por cortes de quantidade de ticks, sensíveis à velocidade do feed | Sequência de pernas entre pivôs temporalmente confirmados e rejeição observada |
| Suporte/Resistência | Extremos fixos de período sem histórico de toques e pivôs | Níveis de pivôs confirmados, número de contatos anteriores e distância ao nível |
| Trend Following | Média arbitrária de 3 velocidades sem estimar força da tendência | Regressões temporais curtas/médias/longas, R², mudança da inclinação, variância |
| Mean Reversion | Supunha retorno a uma média rolante sem estimar se série reverte mesmo | Regressão autorregressiva AR(1) com frequência uniforme, meia-vida OU e estabilidade |
| Breakout | Pressão sobre faixa calculada sem distinguir rompimento de retorno | Deslocamento da faixa, expansão de volatilidade e retorno após a quebra |
| Trendline Breakout | Regressão sobre amostras artificiais, em vez de pivôs reais | Linhas calculadas sobre pivôs confirmados e distâncias normalizadas |
| Fibonacci Retest | Usava mínimo/máximo de intervalo, sem exigir swing finalizado | Swing confirmado, retração relativa e reação em torno dos níveis |
| Smart Confluence | Evidência interna baseada em inclinação e média com pesos amplos | Integração **interna ao próprio motor** de tendência R², AR(1), pivôs e volatilidade |

**Não há filtro universal de reversão, troca automática de motor, votação entre motores, nem espera arbitrária para CALL/PUT**. Preservados todos os horizons [5,10,30,60,120,300] com futuro definido entre T+H e T+2H.

## Testes da versão 13.4.70

O GitHub Actions `sentinel-nine-motor-candidate-1370.yml` verificou:
- Testes anteriores da previsão, UI PC/mobile, contagem fixa, runtime, rollback e modelos.
- Comparação da 13.4.67 copiada literalmente com 13.4.70, **nos mesmos preços, horários, motor e horizonte**.
- Build do website Next.js.
- Compilação Windows EXE com ZIP v13.4.70 efetivamente incorporado e verificações no Windows.
- O primeiro smoke Windows encontrou ZIP antigo embutido, corrigido na montagem do EXE; segundo smoke passou. Os arquivos distribuídos no domínio não foram modificados.

O benchmark é **simulado**: 3.456 pares de previsões em oito cenários (tendência, oscilação irregular, ciclo regular, reversão, falso rompimento, rompimento, mudanças de volatilidade, aleatório), usando duas sementes e quatro momentos por curva. Nove motores enxergam a mesma curva e as observações são correlacionadas. Não são operações reais da IQ Option ou Xnova.

### Resultado total
| Métrica | 13.4.67 | 13.4.70 |
| --- | ---: | ---: |
| Previsões comparadas | 3.456 | 3.456 |
| Acertos | **2.006** | 2.005 |
| Acerto matemático na amostra | **58,04%** | 58,02% |

A candidata corrigiu 269 erros e criou 270 novos. **Não melhorou a previsão agregada.**

### Avaliação individual — 384 previsões por motor
| Motor | Acertos 67 | Acertos 70 | Diferença |
| --- | ---: | ---: | ---: |
| Automático | **229** | 224 | -5 |
| Price Action | 218 | **231** | +13 |
| Suporte/Resistência | **234** | 227 | -7 |
| Trend Following | 217 | **218** | +1 |
| Mean Reversion | **233** | 231 | -2 |
| Breakout | **222** | 216 | -6 |
| Trendline Breakout | **225** | 212 | -13 |
| Fibonacci Retest | 217 | **219** | +2 |
| Smart Confluence | 211 | **227** | +16 |

### Regimes — 432 pares em cada mercado simulado
| Regime | Acertos 67 | Acertos 70 |
| --- | ---: | ---: |
| Tendência | **223** | 217 |
| Oscilação irregular | 190 | **209** |
| Ciclo periódico | 337 | **351** |
| Reversão | **314** | 306 |
| Falso rompimento | **272** | 263 |
| Rompimento | **254** | 252 |
| Volatilidade variada | **227** | 214 |
| Ruído aleatório | 189 | **193** |

A candidata ganha em oscilação de alguns tipos, mas piora em reversão, falso rompimento, tendência e volatilidade. Não é melhoria significativa nem consistente. Não alcançar 75–80% não é falha de CI: **é resultado preditivo medido, não certificado de software**.

### Prazo até entrada — 576 pares por H
| H | Acertos 67 | Acertos 70 |
| --- | ---: | ---: |
| 5s | **337** | 329 |
| 10s | **355** | 347 |
| 30s | 320 | **324** |
| 60s | **353** | 344 |
| 120s | **311** | 304 |
| 300s | 330 | **357** |

## Exigências restantes antes de promover

1. Disponibilizar cotações reais locais da corretora em DEMO, com carimbo temporal, ativo e amostras *exatas* próximas à entrada futura e ao vencimento, para cada prazo. O atual `MarketJournal` do Agent é opt-in via `SENTINEL_MARKET_JOURNAL=1`. Não habilitar coleta sem consentimento do usuário, nem enviar registros para Supabase.
2. Dividir avaliação cronologicamente por dias/ativos, com purge de resultados sobrepostos e período final intacto. Não buscar 75–80% selecionando retrospectivamente operações vencedoras.
3. Rodar métricas por motor, prazo, oscilação, reversão, falso rompimento e volatilidade; conferir custo e payout líquido reais. Comparar corretamente taxa de acerto e cobertura.
4. Fazer mudanças apenas onde defeitos conceituais são reproduzíveis, então testar em novas amostras que não orientaram a mudança.
5. **Somente promover quando os dados confirmarem melhora generalizável e o Agent/site passarem novamente nos testes.** A 13.4.67 publicada permanece intacta.

## Referências técnicas

- Adams & MacKay, 2007, *Bayesian Online Changepoint Detection*, https://arxiv.org/abs/0710.3742
- Relação entre processos OU e regressão AR(1): https://www.quantneeti.com/knowledge-base/time-series/mean-reversion-ou
- Purging e embargo para rótulos financeiros com horizontes sobrepostos: https://github.com/landtml/purgedcv

**DECISÃO: 13.4.70 permanece como prévia técnica, NÃO substitui a 13.4.67 no domínio principal.**
