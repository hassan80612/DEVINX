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
  assert.ok(dashboard.includes('const remaining=item.paid_at?0:Math.max(0,Number(item.amount_minor)-linked)'));
});
