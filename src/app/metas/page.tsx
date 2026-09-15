'use client';
import {AppShell} from '@/components/AppShell';import {GoalManager} from '@/components/GoalManager';import {useI18n} from '@/i18n/provider';export default function Metas(){const{messages:m}=useI18n();return <AppShell titleKey="goalsTitle"><p className="lead">{m.pages.goalsLead}</p><GoalManager/></AppShell>}
