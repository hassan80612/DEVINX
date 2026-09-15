'use client';
import {AppShell} from '@/components/AppShell';import {DebtManager} from '@/components/DebtManager';import {useI18n} from '@/i18n/provider';export default function Dividas(){const{messages:m}=useI18n();return <AppShell titleKey="debtsTitle"><p className="lead">{m.pages.debtsLead}</p><DebtManager/></AppShell>}
