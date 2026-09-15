'use client';
import {AppShell} from '@/components/AppShell';import {TransactionManager} from '@/components/TransactionManager';import {useI18n} from '@/i18n/provider';export default function Gastos(){const{messages:m}=useI18n();return <AppShell titleKey="expensesTitle"><p className="lead">{m.pages.expensesLead}</p><TransactionManager kind="expense"/></AppShell>}
