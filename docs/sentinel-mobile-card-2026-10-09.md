# Sentinel — card móvel e revisão do Subanalista

O card agora aparece em Início e Mercado no site autenticado, com leituras do Agent no PC, Cenário, alerta independente de reversão, três totais e média. Iniciar análise desarma a automação antes de iniciar; uma falha nessa etapa impede o comando de início. Pausar, parar e ajustar prazo/limite usam o canal remoto existente e aguardam confirmação do Agent.

A representação do Cenário utiliza o mesmo módulo `scenario-view.mjs` do Agent 13.4.24. O site não gera previsões novas. A média reproduz a fórmula visual do PC; o limite visual é separado nesta tela. Sem PC online, análise ativa, ativo validado e dados recentes, o card retira direções e percentuais atuais. A contagem de encerramento continua a expirar mesmo sem novo payload. Cotações acima de 8 segundos ou análise acima de 10 segundos são suprimidas no canal remoto, que inclui atraso de transmissão.

## Subanalista que parece travado

A revisão do código mostra que o monitor é chamado pela análise independentemente da autorização do Cenário. Avalia estrutura a cada nova fronteira de barras fechadas de 5 segundos e exige ruptura seguida de continuidade, preservação do nível e espaço até o próximo nível. A frase OBSERVANDO REVERSÃO permanece igual quando não encontra uma reversão confirmada. Cotações antigas, lacunas ou estrutura insuficiente impedem alertas. O site mostra a hora da última análise, idade da cotação, ausência de leitura e níveis de um alerta ativo. Não foi verificada a sessão ao vivo de Hassan, portanto esta revisão não prova a causa do travamento relatado no PC. Os critérios do motor não foram alterados nesta entrega.

## Validação

- Next.js: build de produção e verificação TypeScript aprovados.
- 17 testes existentes de Cenário e reversão aprovados; inclui CALL/PUT, alerta oposto independente, continuidade, invalidação, feed antigo e frequência de avaliação.
- Teste do modelo de apresentação: oposição do Subanalista não muda Cenário, média e limite, dados antigos, pausa, offline, troca de ativo, ausência de validação e encerramento.
- Navegador Chromium em cópia isolada: larguras 360, 390, 768 e 1280 sem transbordamento; estados CALL, PUT, reavaliação, invalidação, atraso, pausa, parada e offline.
- Comandos percorreram UI → API original → RPC/Agent simulados → confirmação → UI. Settings rejeitado impede início; nenhuma ordem ou armação de piloto. Login exigido e API sem sessão retorna 401. No celular, nenhuma tentativa de acessar 127.0.0.1:8787/8788.

O teste utiliza dados sintéticos e um RPC local isolado. Não mede taxa de acerto de previsões, execução na corretora real ou latência na conexão móvel de Hassan. O EXE 13.4.24 e os motores permanecem os mesmos.
