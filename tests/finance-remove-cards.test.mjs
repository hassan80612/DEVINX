import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activeFinanceTransactions,isCardGeneratedTransaction} from '../src/domain/finance-scope.ts';

const file=path=>readFileSync(path,'utf8');

test('legacy card-generated expenses are excluded but ordinary income, expenses and debts survive',()=>{
  const rows=[
    {source_type:'card_installment_payment',amount_minor:5611,payment_method:null},
    {source_type:'card_bill_payment',amount_minor:10000,payment_method:null},
    {source_type:null,amount_minor:1200,payment_method:'credit'},
    {source_type:'debt_payment',amount_minor:2000,payment_method:'pix'},
    {source_type:'future_plan',amount_minor:500,payment_method:null}
  ];
  assert.deepEqual(activeFinanceTransactions(rows).map(x=>x.amount_minor),[1200,2000,500]);
  assert.equal(isCardGeneratedTransaction('card_installment_payment'),true);
  assert.equal(isCardGeneratedTransaction('debt_payment'),false);
});

test('old saved card tab redirects to Movimentos; no card module navigation',()=>{
  const hub=file('src/components/FinanceHub.tsx');
  assert.ok(hub.includes('homeActionCard card'));
  assert.ok(hub.includes("onClick={()=>setSection('bills')}"));
  assert.ok(hub.includes("if(saved==='cards')setSection('movements')"));
  assert.ok(hub.includes("if(target==='cards'){setSection('movements');return}"));
  assert.ok(!hub.includes("setSection('cards')"));
  assert.ok(!hub.includes("<CardManager"));
});

test('dashboard projections and daily target do not read card ledgers',()=>{
  const dash=file('src/components/DashboardOverview.tsx');
  for(const marker of ['cardInst','cardPays','cardRemainingById','card_bill_payments','card_installments','cardsDue','flowCardPays']){
    assert.ok(!dash.includes(marker),'unexpected card calculation: '+marker);
  }
  assert.ok(dash.includes('activeFinanceTransactions('));
  assert.ok(dash.includes('const toPay=recurringPending;'));
  assert.ok(dash.includes('const out=recurring+plannedExpense;'));
  assert.ok(!dash.includes("t('dashboard.cards')"));
});

test('Movimentos and Relatorios have no card payments or pending card UI',()=>{
  const mov=file('src/components/MovementCenter.tsx');
  const report=file('src/components/ReportManager.tsx');
  assert.ok(!mov.includes('purchasePending.length'));
  assert.ok(!mov.includes('searchData.purchases.forEach'));
  assert.ok(!mov.includes("kind:'card-payment',sign:-1"));
  assert.ok(!mov.includes("s.from('card_bill_payments')"));
  assert.ok(!mov.includes("s.from('card_purchases')"));
  assert.ok(!report.includes('cardPays.forEach'));
  assert.ok(!report.includes('card_bill_payments'));
  assert.ok(mov.includes('isCardGeneratedTransaction(item.source_type)'));
  assert.ok(report.includes('isCardGeneratedTransaction(x.source_type)'));
});

test('Posso gastar neither fetches card obligations nor counts paid card transactions',()=>{
  const spend=file('src/components/SpendCheck.tsx');
  assert.ok(!spend.includes('card_bill_payments'));
  assert.ok(!spend.includes('card_installments'));
  assert.ok(!spend.includes('cardPending'));
  assert.ok(spend.includes('isCardGeneratedTransaction(x.source_type)'));
});
