# Sentinel 13.9.44 — controle do bot pelo celular

O painel Mercado agora permite ligar, parar e configurar o mesmo executor do PC, em IQ Option e Exnova. Não cria outro motor nem envia CALL/PUT diretamente do celular. O Agent precisa permanecer aberto no computador; a primeira calibração de botões continua local.

Valor, payout, saldo manual, intervalo, stop loss e minutos podem ser salvos com o bot ligado ou parado, incluindo entrada aberta. Ligar salva primeiro as alterações do formulário e verifica se corretora, ativo e prazo continuam iguais. Parar impede novos cliques; a entrada aberta mantém seu vencimento. A interface não religa automaticamente nem repete um comando após erro.

Estado e limites chegam no canal assinado existente, em representação compacta sem IDs de conta/ordem ou histórico. O heartbeat e o ACK também carregam o estado. Respostas antigas não substituem estados mais recentes; o formulário preserva a edição durante atualizações. Não foi adicionada conexão, leitura ou ordem na corretora nem polling de cotações. Durante visualização autenticada, o heartbeat mantém o PC online mesmo com análise parada.

Três comandos autenticados foram acrescentados à whitelist existente: executor/start, executor/stop e executor/config. Permanecem os controles de sessão, licença e dispositivo do dono; os novos comandos são proibidos entre contas, inclusive pelo Master. POST e mesma origem são exigidos na API. Start expira em 10 segundos na fila. Owner, ACL, RLS e demais comandos não mudam. Os SQLs de aplicação e reversão verificam a definição anterior antes de alterar.

Validação: 392 testes obrigatórios, 13 testes de contrato/API/assinatura, build Next de produção e TypeScript aprovados. Navegador com viewport 390×844 percorreu configuração → ligar → sinal em executor simulado → editar ligado → parar → editar com entrada aberta, em ambos os provedores, sem erros de página ou rolagem horizontal. Nenhuma ordem foi enviada ao dispositivo do usuário. Execução nativa em Windows e corretoras autenticadas não foram testadas nesta sessão.

Os 75 arquivos do motor do analista permanecem idênticos à base preservada. Esta versão não anuncia melhora de assertividade. As hipóteses de inversão e novas regras continuam isoladas porque não demonstraram melhora consistente. O vídeo recuperado permite observar operações e perdas, mas não expõe a regra responsável por cada decisão.

Base e rollback imediato: commit 32ba17004713a085ac8f0e16adc28da739896634, versão 13.9.43, deployment dpl_CP61ox6TuLVD2pPr3YW7m6Jtn8TE. O original 13.9.38 e seu backup continuam preservados.
