import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const eventsSource=readFileSync('src/lib/finance-events.ts','utf8');

function triggerWithWindow(window){
  class MockCustomEvent{constructor(type){this.type=type}}
  runInNewContext(eventsSource.replace(/^export /gm,'')+'\nnotifyFinanceUpdated();',{window,CustomEvent:MockCustomEvent});
}

test('card payment broadcasts a change token to other tabs without sharing financial data',()=>{
  const dispatched=[],stored=[];
  triggerWithWindow({
    dispatchEvent:event=>dispatched.push(event.type),
    localStorage:{setItem:(key,value)=>stored.push([key,value])}
  });
  assert.deepEqual(dispatched,['devinx:finance-updated']);
  assert.equal(stored.length,1);
  assert.equal(stored[0][0],'devinx:finance-sync-v1');
  assert.match(stored[0][1],/^\d+:[a-z0-9]+$/);
});

test('blocked storage does not interfere with the current page payment refresh',()=>{
  const dispatched=[];
  assert.doesNotThrow(()=>triggerWithWindow({
    dispatchEvent:event=>dispatched.push(event.type),
    localStorage:{setItem:()=>{throw new Error('storage blocked')}}
  }));
  assert.deepEqual(dispatched,['devinx:finance-updated']);
});

test('the installed app and browser refresh financial components on focus and visibility',()=>{
  const hub=readFileSync('src/components/FinanceHub.tsx','utf8');
  const dashboard=readFileSync('src/components/DashboardOverview.tsx','utf8');
  const cards=readFileSync('src/components/CardManager.tsx','utf8');
  for(const event of ["'focus'","'visibilitychange'","'storage'"]){
    assert.ok(hub.includes('addEventListener('+event));
    assert.ok(hub.includes('removeEventListener('+event));
  }
  assert.ok(hub.includes('FINANCE_SYNC_STORAGE_KEY'));
  assert.ok(hub.includes('new CustomEvent(FINANCE_UPDATED_EVENT)'));
  assert.ok(dashboard.includes('window.addEventListener(FINANCE_UPDATED_EVENT,scheduleRefresh)'));
  assert.ok(cards.includes('window.addEventListener(FINANCE_UPDATED_EVENT,refresh)'));
  assert.ok(!dashboard.includes('reconcileCardInstallments(cardInst,cardItemPays)'));
  assert.ok(dashboard.includes('activeFinanceTransactions('));
  assert.ok(cards.includes('reconcileCardInstallments(inst,itemPays)'));
  assert.ok(cards.includes("s.rpc('register_card_installment_batch'"));
});

import {reconcileCardInstallments} from '../src/domain/card-installments.ts';

test('paid card installments disappear from purchase, bill and goal balances',()=>{
  const installments=[
    {id:'first',amount_minor:5611,paid_at:'2026-10-31T12:00:00Z'},
    {id:'second',amount_minor:5611,paid_at:null},
    {id:'third',amount_minor:5611,paid_at:null},
  ];
  const balances=reconcileCardInstallments(installments,[]);
  assert.deepEqual(balances.get('first'),{paid:5611,remaining:0});
  assert.equal(balances.get('second')?.remaining,5611);
  assert.equal([...balances.values()].reduce((sum,row)=>sum+row.remaining,0),11222);
});

test('partial payment reduces the same remaining amount in every screen',()=>{
  const balances=reconcileCardInstallments(
    [{id:'installment-2',amount_minor:10000,paid_at:null}],
    [{source_id:'installment-2',amount_minor:2400},{source_id:'installment-2',amount_minor:1600}]
  );
  assert.deepEqual(balances.get('installment-2'),{paid:4000,remaining:6000});
});

test('settlement discount closes an installment even if its cash payment was lower',()=>{
  const balances=reconcileCardInstallments(
    [{id:'discounted',amount_minor:8316,paid_at:'2026-10-31T12:00:00Z'}],
    [{source_id:'discounted',amount_minor:5000}]
  );
  assert.deepEqual(balances.get('discounted'),{paid:8316,remaining:0});
});

test('a fully paid cash ledger never remains pending even without paid_at',()=>{
  const balances=reconcileCardInstallments(
    [{id:'paid-by-ledger',amount_minor:4995,paid_at:null}],
    [{source_id:'paid-by-ledger',amount_minor:2500},{source_id:'paid-by-ledger',amount_minor:2495}]
  );
  assert.deepEqual(balances.get('paid-by-ledger'),{paid:4995,remaining:0});
});
