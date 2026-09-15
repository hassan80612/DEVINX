import {AppShell} from '@/components/AppShell';
import {TransactionManager} from '@/components/TransactionManager';

export default function Gastos(){return <AppShell title="Gastos"><p className="lead">Veja para onde seu dinheiro está indo sem complicação.</p><TransactionManager kind="expense"/></AppShell>}
