import {AppShell} from '@/components/AppShell';
import {PreferencesManager} from '@/components/PreferencesManager';
import {PageLead} from '@/components/PageLead';

export default function Preferencias(){
  return <AppShell titleKey="preferencesTitle">
    <PageLead textKey="preferencesLead"/>
    <PreferencesManager/>
  </AppShell>
}
