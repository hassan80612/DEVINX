'use client';
import {AppShell} from '@/components/AppShell';import {TransactionManager} from '@/components/TransactionManager';import {useI18n} from '@/i18n/provider';export default function Rendas(){const{messages:m}=useI18n();return <AppShell titleKey="incomeTitle"><p className="lead">{m.pages.incomeLead}</p><TransactionManager kind="income"/></AppShell>}
