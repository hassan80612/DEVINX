# Edge Function rollback checklist

Escopo:
- laser-agent-pairing-offer
- laser-agent-pairing-status
- laser-master-pairing-claim

Rollback completo:
1. bloquear imediatamente as funções (handler HTTP 410) se houver tráfego;
2. remover as três Edge Functions do projeto Supabase;
3. aplicar o rollback do schema `devinx_laser`;
4. confirmar que nenhuma função Laser aparece na listagem de Edge Functions;
5. confirmar que nenhuma tabela/schema Laser permanece;
6. reverter/fechar o PR Laser no GitHub;
7. validar DevinX produção a partir da âncora de rollback.

Não reutilizar nomes antigos para funções de outro produto.
