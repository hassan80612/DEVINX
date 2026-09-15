'use client';
import {AppShell} from '@/components/AppShell';import {SpendCheck} from '@/components/SpendCheck';import {useI18n} from '@/i18n/provider';export default function PossoGastar(){const{messages:m}=useI18n();return <AppShell titleKey="spendTitle"><p className="lead">{m.pages.spendLead}</p><SpendCheck/></AppShell>}
