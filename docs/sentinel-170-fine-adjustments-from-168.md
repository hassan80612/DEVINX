# 13.9.170: ajustes finos sobre a 168 aprovada

A base de decisão é a 168 publicada (`569375cdfc00ab57d451919d10127501c8145016`). Os ajustes mais amplos de admissão da 169 foram retirados. Os módulos de reversão rápida, sequência de níveis e revisão de preço são idênticos aos arquivos publicados na 168, conferidos por hash nos testes. O runtime também coincide com a 168, exceto por um timestamp de observação usado exclusivamente na apresentação.

## Única alteração no motor de oportunidades

O setup `closed-structure-and-live-impulse`, que se apoia em quatro candles fechados, não pode tratar como continuidade um retorno curto que o movimento mais recente já voltou a contrariar. O ajuste se aplica somente quando: o setup é exatamente esse; o lado diverge do fluxo recente; esse fluxo está enfraquecendo; o último movimento favorece o fluxo oposto; e o deslocamento dos candles antigos tem sinal oposto ao deslocamento recente.

Essa verificação não altera as regras de rompimentos de nível, reversões estruturais, reversões rápidas ou oscilações. Um início de virada cujo movimento atual apoia o candidato conserva a decisão da 168. Não inverte sinais, cria espera, muda limiares de oscilação ou mantém fila de candidatos. Testes espelhados cobrem CALL e PUT em 30s/1m. Em 5m, a regra própria da 168 continua permitindo somente reversões comprovadas; continuidades não se tornam elegíveis.

O arquivo inteiro do motor é comparado por hash com a 168 após retirar apenas esse pequeno bloco. Isso impede que mudanças adicionais de estratégia passem despercebidas nesta release.

## Mensagens e expiração

- Mantém a atualização rápida de textos da 169 e a proteção contra render antigo.
- Retira o contador de idade da cotação. Com dados atuais, não acrescenta linha técnica; mostra a leitura de continuidade, enfraquecimento e reversão. Durante uma operação, preserva seu recibo e a interpretação atual.
- Atraso real permanece identificado com texto estático na linha secundária, sem contador.
- Conserva a identificação e persistência dos controles de expiração e período do gráfico, com escolhas de 30s, 1m e 5m independentes.
- Conserva a correção de unidade dos timestamps do ticker. Essa correção de leitura não redefine os setups.

## Comparação disponível

Nos mesmos 95 instantes gravados anteriormente, com entrada somente de dados disponíveis naquele instante, a única divergência da 168 é a 10ª entrada da sessão recente: CALL baseada em estrutura antiga, com fluxo recente PUT enfraquecendo e último movimento novamente para PUT. As 50 operações vencedoras que a 168 admitia nesses arquivos continuam admitidas. Nenhuma direção foi invertida.

Isso não simula as operações que surgiriam depois de recusar um candidato e não comprova assertividade futura. A 6ª entrada, de rompimento após movimento esticado, não é eliminada artificialmente: a regra estreita acima não a cobre, e os dados também contêm rompimentos semelhantes vencedores. Não foi adicionado um bloqueio geral para adaptar o motor às perdas já conhecidas. O LOSS relatado na 169 ainda necessita do ZIP daquela rodada para rastreamento individual.

Os registros disponíveis são de 1m. Testes de comportamento e navegador cobrem os três prazos. A leitura do controle nativo específico da sessão real ainda precisa de confirmação ao vivo; os testes de expiração são isolados e não executam ordens.

Validação antes da publicação: 754 testes de regressão aprovados, build de produção e tipos aprovados, navegador isolado verificando os três prazos, a atualização rápida da leitura, a ausência do contador técnico e a proteção contra render antigo. O cronômetro operacional de vencimento que já existia na 168 foi preservado.

Rollback preservado: `rollback/sentinel-13.9.168-stable-20261029`, commit `569375cdfc00ab57d451919d10127501c8145016`, deployment `dpl_he1a1S38K2MpFTjpJ6RbJqe7Aweh`. A release 169 também permanece identificada em sua branch própria.
