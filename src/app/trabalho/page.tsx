'use client';
import {AppShell} from '@/components/AppShell';import {WorkManager} from '@/components/WorkManager';import {useI18n} from '@/i18n/provider';export default function Trabalho(){const{messages:m}=useI18n();return <AppShell titleKey="workTitle"><p className="lead">{m.pages.workLead}</p><WorkManager/></AppShell>}
