'use client';
import {AppShell} from '@/components/AppShell';import {RecurringManager} from '@/components/RecurringManager';import {useI18n} from '@/i18n/provider';export default function Recorrentes(){const{messages:m}=useI18n();return <AppShell titleKey="recurringTitle"><p className="lead">{m.pages.recurringLead}</p><RecurringManager/></AppShell>}
