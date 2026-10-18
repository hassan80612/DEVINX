# Sentinel 13.9.43 — saldo recebido, configuração e estratégia

O bot 13.9.42 já executava CALL/PUT, mas bloqueava todos os campos enquanto ligado ou com entrada pendente, desarmava ao trocar apenas a estratégia e podia manter a pendência indefinidamente sem cotação de encerramento. O stop loss dependia somente da estimativa local.

## Comportamento

- IQ Option e Exnova: saldo da conta selecionada obtido dos eventos nativos já recebidos de perfil, balances e balance-changed, incluindo envelopes aninhados e sockets restaurados. Sem OCR, novas requisições, assinatura de saldo, polling adicional ou Supabase. O painel identifica o último saldo recebido e seu horário. Frames de mercado e eventos de outra conta não renovam o horário/revisão desse saldo.
- Ao ligar com saldo recebido válido, ele é a base da sessão e do stop loss. Zero é um saldo válido, não ausência. Sem saldo recebido, a ativação usa o saldo manual sem esperar leitura. A fonte é fixada ao iniciar; se o primeiro saldo chegar durante uma sessão manual, o painel explica que será utilizado ao religar.
- Stop loss mede a variação do saldo da conta desde a ativação. Durante uma entrada, um débito observado de pelo menos o valor configurado é tratado como capital reservado, não perda encerrada. No vencimento, o pulso existente concede até 1 segundo para receber o crédito antes de aplicar o último saldo disponível. Não instala temporizador ou espera de confirmação de ordem.
- Resultado por preço de entrada/vencimento e payout informado continua uma estimativa separada. Não representa resultado oficial da corretora. Mudanças de saldo por outras operações, depósitos ou saques também afetam o limite da conta. Crédito recebido com atraso superior a 1 segundo ainda pode causar parada conservadora; o último saldo recebido não é garantia de atualização instantânea. Valor e duração devem continuar ajustados manualmente na corretora conforme o painel.
- Todos os campos podem ser editados durante a execução e depois de parar, inclusive com entrada aberta. Somente a curta ativação assíncrona protege os campos. Tempo conta desde o início original da sessão; zero desativa o limite. Stop loss atualizado é aplicado imediatamente. Valor, payout e intervalo novos valem para próximas entradas; uma entrada já enviada preserva seus parâmetros. Saldo manual vale para a próxima sessão. Escritas locais de configuração são serializadas e atômicas.
- Parar impede novos cliques e mantém a entrada aberta acompanhada até o vencimento. Se faltar preço válido, a pendência é liberada como resultado desconhecido, sem inventar lucro/perda. Em sessão manual ativa, falta de preço no vencimento por mais de 15 segundos para o bot e libera a pendência.
- Trocar apenas a estratégia mantém o bot ligado. Uma entrada já enviada conserva o vencimento. Sinal velho da estratégia anterior é descartado; troca antes do clique cancela a entrada anterior sem desarmar. O próximo sinal final fresco da estratégia atual pode ser seguido. A programação do analista e o intervalo escolhido continuam determinando quando existe sinal; não há promessa de entrada imediata ao trocar.
- Mudança de corretora, ativo, prazo, conta identificada, pausa do analista e licença mantêm os controles existentes. Mapeamentos CALL/PUT separados por corretora permanecem. O executor continua somente clicando na direção final do analista, sem preencher valor/duração nem exigir reconhecimento de ordem.

## Validação

21 novos testes de lógica, incluindo troca de estratégia antes do clique, edição com entrada aberta, ausência de cotação, saldo zero, reserva do débito e divergência entre estimativa por preço e saldo recebido. Suíte obrigatória e instalador são verificados no prebuild. Fixtures Chromium de painel e eventos nativos para IQ e Exnova validam edição com bot ligado/parado, saldo, stop loss, liberação de pendência desconhecida e CALL/PUT após trocar estratégia. Fixtures anteriores de controles HTML, migração de overlay e calibração canvas também passam. Não houve sessão autenticada, operação financeira real ou execução nativa em Windows nesta sessão.

Motor do analista e suas regras de decisão permanecem byte a byte iguais à 13.9.42. As imagens enviadas pelo usuário descrevem comparações históricas com desempenho inconsistente entre dias; nenhuma dessas hipóteses foi incorporada, e esta versão não afirma ganho de assertividade.

Base: commit `fd7e026ce4b981a53e7da62722306e1eae364c60`, versão 13.9.42. Original 13.9.38 preservado no commit `3d9317181686a5b14bdb57834560d984d9ea375c`, branch `backup/sentinel-13.9.38-original-20261018` e deployment `dpl_8krxzDhKBrVr8BxqJWUj3UdBqJkm`.

Versão 13.9.43, build `13.9.43-live-settings-broker-balance`.

Prebuild completo: 389 testes passaram. Arquivo local extraído: 103 regressões passaram, 117 arquivos idênticos ao código-fonte. EXE SHA256: `13d62519aae68d684237cc36e2fe111cc5e194a143b55fbbd072624f229161d6`. Payload SHA256: `ffd590f50116f0607f13fa56bf327406c0cff9b3703426326f4d4eb87ac55adc`.

Publicação verificada: commit `32ba17004713a085ac8f0e16adc28da739896634`, deployment `dpl_CP61ox6TuLVD2pPr3YW7m6Jtn8TE` READY. Origem imutável e domínio `https://trading.devinx.com.br` serviram os mesmos bytes do instalador local; 103 regressões passaram sobre o payload baixado de cada origem. Aliases de download são idênticos, ZIP/CRC corretos, Range HTTP 206 confirmado.
