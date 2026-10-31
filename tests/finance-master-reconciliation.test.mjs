import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {billRemaining} from '../src/domain/recurring.ts';
import {reconcileCardInstallments,summarizeCardOutstanding} from '../src/domain/card-installments.ts';

test('paid recurring bill stays paid when dashboard chart period changes',()=>{
  const bill={id:'bill-1',amount_minor:100000,due_day:10,start_month:'2026-10-01',installment_count:3};
  const pays=[{recurring_bill_id:'bill-1',due_month:'2026-10-01',amount_minor:100000}];
  assert.equal(billRemaining(bill,'2026-10-01',pays,[]),0);
  assert.equal(billRemaining(bill,'2026-11-01',pays,[]),100000);
  const dashboard=readFileSync('src/components/DashboardOverview.tsx','utf8');
  const change=dashboard.slice(dashboard.indexOf('async function loadFlowData('),dashboard.indexOf('useLayoutEffect('));
  assert.ok(change.includes('setFlowBillPays('));
  assert.ok(!change.includes('setFlowCardPays('));
  assert.ok(!change.includes('setBillPays('));
  assert.ok(!change.includes('setCardPays('));
  assert.ok(dashboard.includes('setBillPays(allBillPays)'));
  assert.ok(!dashboard.includes('setCardPays(allCardPays)'));
});

test('recurring settlement with discount leaves no phantom debt',()=>{
  const bill={id:'bill-2',amount_minor:8316,due_day:6,start_month:'2026-10-01',installment_count:1};
  const pay=[{recurring_bill_id:'bill-2',due_month:'2026-10-01',amount_minor:5000}];
  const overrides=[{recurring_bill_id:'bill-2',due_month:'2026-10-01',amount_minor:5000,due_day:6}];
  assert.equal(billRemaining(bill,'2026-10-01',pay,overrides),0);
  assert.equal(billRemaining(bill,'2026-10-01',pay,[]),3316);
});

test('card totals and daily goal use same paid-at and linked-payment ledger',()=>{
  const inst=[
    {id:'paid',amount_minor:4995,paid_at:'2026-10-12T12:00:00Z',dueDate:'2026-10-06',billing_month:'2026-10-01'},
    {id:'partial',amount_minor:5611,paid_at:null,dueDate:'2026-11-06',billing_month:'2026-11-01'}
  ];
  const paid=reconcileCardInstallments(inst,[{source_id:'partial',amount_minor:2000}]);
  const rows=inst.map(i=>({...i,remaining:paid.get(i.id)?.remaining||0}));
  const summary=summarizeCardOutstanding(rows,'2026-10-01','2026-10-31');
  assert.equal(summary.total,3611);
  assert.equal(summary.future,3611);
  assert.equal(rows.reduce((n,r)=>n+r.remaining,0),3611);
});

test('movement global search must subtract payments and discounts before showing pending bill',()=>{
  const source=readFileSync('src/components/MovementCenter.tsx','utf8');
  assert.ok(source.includes('billRemaining(b,month,searchData.recPays,searchData.billOverrides)'));
  assert.ok(source.includes('billDueDay(b,month,searchData.billOverrides)'));
  assert.ok(source.includes("if(!month)return; // Fully paid bills are history, not pending debt."));
  assert.ok(source.includes('if(failed){setSearchError'));
});

test('temporary loading errors cannot erase an existing bill or payment ledger',()=>{
  const recurring=readFileSync('src/components/RecurringManager.tsx','utf8');
  const movements=readFileSync('src/components/MovementCenter.tsx','utf8');
  assert.ok(recurring.includes('if(b.error||p.error||o.error||c.error)'));
  assert.ok(movements.includes('if([r1,r2,r3,cats].some(result=>result.error))'));
});
