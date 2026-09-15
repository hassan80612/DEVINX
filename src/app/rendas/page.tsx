import {AppShell} from '@/components/AppShell';
import {TransactionManager} from '@/components/TransactionManager';

export default function Rendas(){return <AppShell title="Rendas"><p className="lead">Tudo o que entra, separado por origem.</p><TransactionManager kind="income"/></AppShell>}
