# Sentinel: histórico válido descartado antes de 50 velas

17/10/2026. Base publicada: **13.9.33**, commit `8df7b48bc1dad41e46bd6f14e2c9a95d443ec093`. **Este candidato ainda não foi publicado.**

## Falha reproduzida

O motor contém análise de níveis em 3, 10, 20, 50 e 100 velas, mas o caminho de ingestão não entregava todas essas janelas ao motor. O driver associava `analysisFeedValidated` a pelo menos 50 velas. O runtime reutilizava essa mesma indicação para decidir se o histórico podia ser usado. Assim, com 3 a 49 velas válidas já recebidas, o preço recente podia continuar sendo analisado enquanto o contexto de velas era descartado.

Isso explica uma situação em que o histórico solicitado perde influência e sobra a análise de cotações recentes. **Não demonstra que esse seja o motivo de todos os sinais ruins, nem que explique uma sessão que já tenha 50 ou mais velas válidas e atuais entregues ao motor.**

Os testes anteriores de três velas alimentavam diretamente o runtime com `analysisFeedValidated:true`. Eles verificavam o reconhecimento estrutural, mas não reproduziam a decisão real do driver sobre essa indicação. O novo teste começa nas mensagens de mercado, passa pelo driver e pelo adaptador, entra no runtime e confere a janela e a apresentação no celular. Antes da correção, falhou nos caminhos de IQ Option e Exnova.

## Correção implementada

A procedência do histórico recebido agora tem uma indicação própria, `historicalCandlesVerified`. Ela exige o mesmo ativo, histórico íntegro, contexto recente e identidade de ativo das velas. O adaptador transmite essa indicação ao runtime. O runtime conserva a compatibilidade com produtores antigos que ainda não enviam esse campo; uma rejeição explícita continua sendo respeitada.

A regra antiga de prontidão com 50 velas foi preservada para os caminhos legados. Ela deixou de impedir o uso estrutural das velas válidas que já chegaram. A seleção das velas fechadas continua no motor; velas em formação e dados futuros não são promovidos a suporte ou resistência confirmados.

O motor usa somente as janelas disponíveis: três velas não viram 100 velas. Não há criação de histórico anterior, nova consulta, coleta obrigatória de 100 velas, espera fixa ou leitura de relógio da corretora. O preço atual continua precisando de validação própria. A correção não autoriza ordens automáticas.

## Evidência de ingestão antes/depois

Mensagens controladas foram processadas pelas funções de produção do driver, adaptador e runtime, usando o mesmo formato de entrada em ambos os lados. Foram exercitados IQ Option/Exnova, suporte/resistência e contagens 3, 10, 20, 49, 50 e 100: **24 casos**.

- Em 16 casos com 3 a 49 velas, a 13.9.33 descartou o contexto; o candidato conservou exatamente as velas recebidas e reconheceu a reação estrutural preparada no teste.
- Em oito casos com 50 ou 100 velas, o contexto que já funcionava foi preservado.
- As entradas liberadas nos casos controlados usam a cotação atual e vencem 30 segundos após a emissão. Nenhuma ordem foi enviada.

Esses são testes de integração com entradas sintéticas, **não 16 acertos de mercado**. Não há preço futuro ou resultado de operação nesses casos. Os detalhes estão em `sentinel-received-history-compare-20261017.json`.

## Influência da última cotação: o que foi medido

Uma auditoria separada executou a 13.9.33 sobre a extração de seis casas do vídeo já conhecido. Nos 15 instantes de emissão, a cotação mais recente foi perturbada de forma controlada; o histórico anterior e o estado de aprendizado foram mantidos. Entre as 72 variações que permaneceram dentro da faixa observada de 60 segundos, não houve troca do lado com uma alteração apenas da última cotação. Cinco variações retiraram a qualificação da entrada, por efeito sobre o gatilho curto.

Esse resultado aponta sensibilidade no momento de liberar a entrada, mas **não comprova que a cor da última vela sozinha determine a direção**. Cotação, deslocamento dos últimos segundos e vela visível da corretora são coisas diferentes. A extração não fornece o período completo da vela visível nem as 100 velas anteriores recebidas pelo Agent. Não foram inventados esses dados.

A auditoria também mantém explícito que sinais de 30 segundos não precisam acompanhar o deslocamento imediatamente anterior: na gravação, dez dos 15 sinais estavam opostos ao deslocamento líquido dos 30 segundos anteriores. Esse número é uma descrição do replay, não uma recomendação de operar contra a vela ou uma medida de assertividade.

A auditoria de sensibilidade não alterou o motor e não avaliou ganhos/perdas das cotações perturbadas. Ela está em `sentinel-current-candle-influence-20261017.json`.

## Ajuste inicial preservado separadamente

O candidato também conserva a correção de escolha inicial de projeção já testada na branch `research/sentinel-bootstrap-fit-20261017`, commit `88205f6a228ad9a1033acf3d106fb4b4ffef2965`. Durante as primeiras comparações, uma projeção alternativa pode ser escolhida se tiver evidência penalizada forte, cobertura suficiente e as mesmas observações/horizonte. A política madura permanece igual.

No replay combinado, os resultados foram **10 acertos/4 erros → 11 acertos/3 erros**, com um vencimento ausente em ambos os lados. Todos os instantes, preços e vencimentos são iguais; somente a entrada no segundo 83 mudou de CALL para PUT. A extração de cinco casas permaneceu 10/3, com um vencimento ausente. As duas extrações são da mesma gravação já utilizada na pesquisa.

**Esse ganho pontual vem da escolha inicial de projeção. O vídeo não contém o histórico necessário para medir o efeito da correção de ingestão. Não se atribui o ganho 11/3 ao histórico de velas.** Os três erros restantes continuam presentes.

A avaliação sintética do ajuste inicial teve cinco trajetórias melhores, uma pior e nove iguais. A regressão de 16/8 para 15/9 em recuos variáveis foi conservada no relatório dessa branch. Nenhuma regra de prioridade geral à reversão de faixa foi incluída: essa tentativa chegou a melhorar o vídeo para 12/2, mas piorou outro cenário e foi rejeitada.

## Verificação e estado da publicação

**272 testes distintos passaram:** 253 casos da base, sete de escolha inicial e 12 de ingestão de histórico. As baterias principais foram 74 + 20 + 139 + 39. Após tornar a entrada de teste mais realista e reutilizável, os 12 testes da ingestão foram executados novamente e passaram, incluindo a apresentação PC/celular.

Foram verificados rejeição em suporte e resistência, intervalos disponíveis, ativo errado, troca de ativo ainda não confirmada, histórico velho, integridade inválida, preço atual ausente/atrasado, compatibilidade com produtores anteriores, velas em formação, imutabilidade da chamada e prazo integral. A comparação adicional de 24 entradas controladas passou. Não houve teste de instalação nativa no Windows nesta etapa.

As mudanças de aplicação ficam em quatro módulos: driver, adaptador de mercado, snapshot do runtime e seletor inicial. As fórmulas de projeção e o mapa de suporte/resistência não foram reescritos. A atualização não acrescenta cálculo de outra curva, contador ou requisição de rede.

**Site e instalador publicados continuam na 13.9.33. Este código é um candidato de pesquisa corrigido e testado, ainda não uma publicação.** Para testar a correção no Windows será necessária uma nova versão do Agent com instalador reconstruído e conferido. Não há comprovação de 84–90% de assertividade real ou de eliminação geral de erros.

## Reprodução

```bash
node --test tests/sentinel-received-history-ingestion.test.mjs tests/sentinel-bootstrap-fit.test.mjs
node scripts/sentinel-received-history-compare-20261017.mjs /caminho/da/13.9.33/agent
node scripts/sentinel-current-candle-influence-20261017.mjs /caminho/da/13.9.33/agent/src/core
node scripts/sentinel-observed-sequence-video.mjs /caminho/da/13.9.33/agent/src/core
```
