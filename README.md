# DEVINX

Controle financeiro pessoal e de trabalho, mobile-first.

## Princípios
- Projeto independente do VetorizeAI.
- Internacionalização desde a base; PT-BR inicial, preparado para EN/ES/AR e RTL.
- Valores monetários armazenados numericamente; formatação por locale/moeda na interface.
- Categorias e regras usam IDs estáveis, nunca textos traduzidos.
- Módulos financeiros separados e consolidados no dashboard.
- Custos operacionais de trabalho separados de despesas pessoais.
- Cartões/faturas sem dupla contagem de despesas.
- Histórico padrão de 12 meses configurável.
- Segurança por usuário via Supabase Auth + RLS.
- Mobile-first e lançamentos rápidos.

## Módulos V1
- Perfil e preferências
- Fontes de renda/profissões
- Motorista e entregador
- Veículos (combustão, híbrido, elétrico)
- Jornadas de trabalho
- Entradas
- Despesas pessoais
- Gastos evitáveis
- Contas recorrentes
- Cartões, faturas e parcelas
- Dívidas
- Metas diária/semanal/mensal
- Relatórios consolidados e por atividade

## Stack planejada
Next.js + TypeScript + Supabase + Vercel.
