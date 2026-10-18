# Diagnóstico de mercado do próprio agente — ajuste preparado, não aplicado

O usuário confirmou que a operação encerra 30 segundos após o clique. O horizonte manual de 30s está temporalmente alinhado com essa descrição; a hipótese de vencimento fixo deixa de orientar esta investigação. Isso não demonstra que a previsão tenha vantagem nem confirma a referência de preço de um contrato.

O agente 13.9.43 já tem a função marketDiagnostic e reconhece o comando diagnostics/market. Ela copia somente mercado já recebido em memória: até 600 cotações, 12 candles, configuração temporal/estratégia e âncora do sinal. Não envia ordem, não consulta o painel da corretora, não cria conexão nova e não devolve credenciais, saldo ou identificadores de conta.

A função pública sentinel_enqueue_command no projeto atual não inclui diagnostics/market na lista de comandos permitidos. A coleta não foi forçada por inserção direta na fila. O navegador Opera também não está conectado; não foi iniciada outra sessão de navegador.

## Mudança proposta

Adicionar somente o literal 'diagnostics/market' à lista já existente. O restante da definição da função é preservado integralmente, incluindo sessão válida, acesso ativo, dispositivo ativo/online e restrição que impede comandos de diagnóstico entre contas, inclusive para master. Não há liberação pública, alteração de RLS, novos grants, ordem financeira ou alteração do analista/bot.

O arquivo forward inclui uma comparação da definição atual com a cópia lida para revisão. Se houver qualquer mudança concorrente, para em vez de sobrescrever. O rollback tem a mesma proteção e repõe a definição original. CREATE OR REPLACE mantém a identidade e ACL existentes da função; a proposta não altera propriedade nem permissões SQL.

## Estado da verificação

- Diferença da função: uma adição de literal de comando, 21 caracteres; todos os outros bytes são os originais.
- A lista de controles permitidos, verificações de acesso e restrição entre contas permanecem intactas.
- A implementação existente do diagnóstico foi lida e não faz chamada à corretora.
- Nenhum comando de diagnóstico foi enfileirado.
- Nenhum DDL ou alteração de função foi executado.
- A execução e teste do fluxo real dependem da autorização para modificar esta lista na aplicação publicada.

## Após autorização

Aplicar forward após nova conferência da definição, solicitar uma única amostra ao computador do proprietário e conferir a resposta. A amostra será usada para replay causal da sessão nativa e não será publicada em GitHub. Diagnóstico individual não cria streaming nem coleta periódica. A chamada segue o mesmo controle de acesso do produto. Testar sessão inválida, acesso entre contas negado e solicitação válida do próprio dispositivo, sem emitir sinal de compra/venda ou alterar configurações.

Caso seja necessário desfazer, aplicar rollback enquanto a definição ainda corresponde exatamente à alteração revisada.

Este ajuste desbloqueia evidência da corretora real. Não é anunciado como melhoria de assertividade.
