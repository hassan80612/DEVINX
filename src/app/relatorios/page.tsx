'use client';
import {AppShell} from '@/components/AppShell';import {ReportManager} from '@/components/ReportManager';import {useI18n} from '@/i18n/provider';export default function Relatorios(){const{messages:m}=useI18n();return <AppShell titleKey="reportsTitle"><p className="lead">{m.pages.reportsLead}</p><ReportManager/></AppShell>}
