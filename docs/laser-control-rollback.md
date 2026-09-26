# Laser Control — rollback contract

## Palavra-chave operacional

Quando o proprietário disser **"rollback do Laser Control"**, o objetivo é remover integralmente o trabalho iniciado nesta feature e restaurar o DevinX sem resíduos do módulo.

## Âncora pré-Laser Control

- Branch imutável de referência: `rollback/pre-laser-control-2026-09-26`
- Commit pré-feature: `67297839f3814814b2bb22628414c90c1ece4779`
- Feature: `feature/laser-control-foundation`
- Pull request: `#35`

A branch de rollback foi criada diretamente do commit base original da feature.

## Situação no momento deste registro

A fundação começou somente com arquivos novos. Depois da entrada das Edge Functions Deno, o único arquivo pré-existente alterado intencionalmente foi `tsconfig.json`, apenas para excluir `supabase/functions` do typecheck Node/Next. A âncora pré-Laser continua sendo a referência exata para restaurá-lo.

Isso significa que, enquanto o PR não for mesclado, rollback = abandonar/fechar o PR e remover a branch da feature. Produção permanece exatamente como estava.

## Se futuramente houver merge

Manter todo o Laser Control no mesmo PR até o primeiro lançamento. O rollback de código deve ser feito revertendo o merge/PR do Laser Control, nunca resetando a branch principal para trás, para não apagar trabalhos posteriores não relacionados.

Depois do revert:
1. confirmar build do DevinX;
2. confirmar que nenhuma rota `/laser-control` existe;
3. confirmar que nenhuma navegação pública contém Laser Control;
4. confirmar que workflows exclusivos do Agent foram removidos;
5. executar o rollback de banco somente se a migration correspondente tiver sido aplicada;
6. revogar credenciais/tokens de Agents já pareados;
7. remover qualquer deployment/alias específico criado para Laser Control, se houver.

## Banco

As migrations do Laser Control foram aplicadas ao Supabase correto do DevinX, mas continuam isoladas no schema privado `devinx_laser`, sem acesso direto para `anon` ou `authenticated`.

Rollback correspondente:
`supabase/rollback/20260926173715_laser_control_foundation_private_schema.down.sql`

Migrations aplicadas: `20260926173715 laser_control_foundation_private_schema`, `20260926173813 laser_control_fk_indexes` e `20260926174153 laser_control_pairing_schema_refinement` e `20260926174502 laser_control_keypair_device_auth` e `20260926174632 laser_control_internal_pairing_rpcs`.\n\nRollbacks granulares: `supabase/rollback/20260926173813_laser_control_fk_indexes.down.sql` e `supabase/rollback/20260926174153_laser_control_pairing_schema_refinement.down.sql` e `supabase/rollback/20260926174502_laser_control_keypair_device_auth.down.sql` e `supabase/rollback/20260926174632_laser_control_internal_pairing_rpcs.down.sql`.\n\nRegra obrigatória: toda futura migration do Laser Control precisa vir acompanhada de instruções de rollback no mesmo PR antes de ser aplicada.

## Agent Windows

Antes do primeiro instalador público, o Agent precisa possuir desinstalação que remova:
- executável/serviço/tray app;
- inicialização automática;
- credencial DevinX do dispositivo;
- segredo local LightBurn;
- chave privada e identidade do Agent;
- arquivos em `%LOCALAPPDATA%\DevinXLaserAgent`.

Nenhum desses dados existe no PC do usuário enquanto o Agent não for instalado.

## Regra de isolamento

Não adicionar links públicos, cards, menus ou CTAs do Laser Control antes da autorização explícita de lançamento.

A rota de desenvolvimento deve permanecer master-only e noindex.

## Proibição

Nunca usar o branch de rollback como área de desenvolvimento. Ele é apenas uma fotografia pré-feature.
