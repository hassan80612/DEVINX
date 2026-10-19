# Sentinel etapa 4 — teste isolado de conflito estrutural versus projeção
Data: 2026-10-19. Pesquisa e correção de lógica somente na branch; nenhuma alteração no bot ou Martingale. Base da produção: 13.9.55, commit d7294b75c3aaa1ce4471acaeb96b86c920cd3836.

## Alteração implementada (ainda não publicada)
- Quando estrutura e projeção de 30 segundos são ambas prontas e discordam, a etapa 4 deixa de substituir o CALL/PUT sem comprovação. Ela marca `unverified-forecast-structure-conflict`, libera apenas evidências estruturais posteriores independentes, e mantém intacta a janela já emitida.
- O seletor da projeção ampla é checado pela MESMA regra após a seleção.
- Não houve nenhuma alteração em `signal-executor`, saldo, stop-loss, níveis ou cliques de Martingale.

## Validação e motivo de não publicar
Os testes focados do arbítrio passaram. Porém a substituição da antiga regra modifica deliberadamente os horários e a densidade das chamadas. Na única gravação antiga disponível (duas amostragens do MESMO vídeo, **não** dois conjuntos independentes), houve piora ao reexecutar a política completa:

| Extrato do mesmo vídeo | 13.9.55 original | Proteção isolada na etapa 4 |
| - | - | - |
| 2 Hz | 11 acertos, 3 erros, 1 desconhecido | 6 acertos, 4 erros |
| 1 Hz | 10 acertos, 3 erros, 1 desconhecido | 5 acertos, 6 erros |

Os resultados são só histórico de replay, não as operações recentes da conta real. O candidato não demonstra melhora e pode reduzir a assertividade. A etapa de prebuild teve 190 verificações básicas aprovadas, mas cinco testes de integração posteriores ainda preservam admissões e horários exatos da política antiga e falham após a mudança — é necessário revisar essas expectativas cuidadosamente, não eliminá-las por conveniência.

**DECISÃO:** não publicar essa versão experimental como correção da assertividade e não declarar melhoria. A 13.9.55 continua intocada. Para corrigir de maneira válida, a escolha entre projeção e estrutura precisa usar comparação prospectiva de resultados concluídos, sem vazamento temporal e com mercados/tempos novos separados do desenvolvimento. Resultados da sessão de perda não estão disponíveis aqui, portanto não é possível confirmar a causa daquele prejuízo nem garantir lucratividade.

Reprodução: `scripts/sentinel-13956-stage4-compare-old-video.mjs`; testes de contrato: `tests/sentinel-13956-stage4-structural-cycle-arbitration.test.mjs`; workflow: `.github/workflows/sentinel-13956-stage4-direction-only-validation.yml`.
