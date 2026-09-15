'use client';
import {AppShell} from '@/components/AppShell';import {CardManager} from '@/components/CardManager';import {useI18n} from '@/i18n/provider';export default function Cartoes(){const{messages:m}=useI18n();return <AppShell titleKey="cardsTitle"><p className="lead">{m.pages.cardsLead}</p><CardManager/></AppShell>}
