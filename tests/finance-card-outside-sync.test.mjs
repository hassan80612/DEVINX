import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileCardInstallments,summarizeCardOutstanding} from '../src/domain/card-installments.ts';

function cardView(installments,transactions,today='2026-10-31'){
  const balances=reconcileCardInstallments(installments,transactions);
  const rows=installments.map(item=>({
    ...item,
    remaining:balances.get(item.id).remaining,
    dueDate:item.dueDate,
    billing_month:item.billing_month
  }));
  return{rows,summary:summarizeCardOutstanding(rows,today.slice(0,7)+'-01',today)};
}

test('external card totals always equal the sum of open installments inside',()=>{
  const installments=[
    {id:'p1',amount_minor:5611,paid_at:'2026-10-20T12:00:00Z',dueDate:'2026-10-06',billing_month:'2026-10-01'},
    {id:'p2',amount_minor:5611,paid_at:null,dueDate:'2026-11-06',billing_month:'2026-11-01'},
    {id:'p3',amount_minor:4995,paid_at:null,dueDate:'2026-11-06',billing_month:'2026-11-01'},
    {id:'p4',amount_minor:6167,paid_at:null,dueDate:'2026-11-06',billing_month:'2026-11-01'}
  ];
  const {rows,summary}=cardView(installments,[]);
  const inside=rows.reduce((sum,row)=>sum+row.remaining,0);
  assert.equal(summary.total,16773);
  assert.equal(summary.total,inside);
  assert.equal(summary.statements.length,1);
  assert.equal(summary.statements[0].amount,16773);
  assert.equal(summary.now,0);
  assert.equal(summary.future,16773);
});

test('settled historical installment cannot inflate external card total or meta',()=>{
  const installments=[
    {id:'historic',amount_minor:8316,paid_at:'2026-10-20T12:00:00Z',dueDate:'2026-10-06',billing_month:'2026-10-01'},
    {id:'open',amount_minor:5611,paid_at:null,dueDate:'2026-11-06',billing_month:'2026-11-01'}
  ];
  const {summary}=cardView(installments,[{source_id:'historic',amount_minor:2000}]);
  assert.equal(summary.total,5611);
  assert.equal(summary.statements[0].amount,5611);
});

test('partial and full settlement automatically change both external and internal balances',()=>{
  const installments=[{id:'loan',amount_minor:10000,paid_at:null,dueDate:'2026-11-06',billing_month:'2026-11-01'}];
  const partiallyPaid=cardView(installments,[{source_id:'loan',amount_minor:2500}]);
  assert.equal(partiallyPaid.summary.total,7500);
  assert.equal(partiallyPaid.rows[0].remaining,7500);
  const completelyPaid=cardView(installments,[{source_id:'loan',amount_minor:10000}]);
  assert.equal(completelyPaid.summary.total,0);
  assert.equal(completelyPaid.summary.statements.length,0);
  assert.equal(completelyPaid.rows[0].remaining,0);
});

test('collapsed card and dashboard ignore responses from older refreshes',()=>{
  const card=readFileSync('src/components/CardManager.tsx','utf8');
  const dash=readFileSync('src/components/DashboardOverview.tsx','utf8');
  assert.match(card,/requestId=\+\+lastLoad\.current/);
  assert.match(card,/if\(requestId!==lastLoad\.current\)return/);
  assert.match(dash,/requestId=\+\+latestSnapshotRequest\.current/);
  assert.match(dash,/if\(requestId!==latestSnapshotRequest\.current\)return/);
  assert.match(card,/summarizeCardOutstanding\(rows,current,localDateISO\(\)\)/);
});
