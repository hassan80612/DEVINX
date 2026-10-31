import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=name=>readFileSync(name,'utf8');

test('fourth home card points to Contas Mensais without changing bottom navigation',()=>{
  const hub=file('src/components/FinanceHub.tsx');
  assert.match(hub,/homeActionCard card" onClick=\{\(\)=>setSection\('bills'\)\}/);
  assert.ok(hub.includes("t('nav.bills')"));
  assert.ok(hub.includes("section==='movements'&&<MovementCenter"));
  assert.ok(hub.includes("section==='bills'&&<RecurringManager"));
  assert.ok(!hub.includes("setSection('cards')"));
});

test('quick expense and monthly bills have no dead card navigation',()=>{
  const quick=file('src/components/QuickCapture.tsx');
  const monthly=file('src/components/RecurringManager.tsx');
  const legacy=file('src/components/TransactionManager.tsx');
  assert.ok(!quick.includes("go('cards')"));
  assert.ok(!monthly.includes("onNavigate('cards')"));
  assert.ok(!legacy.includes("onNavigate('cards')"));
  assert.ok(monthly.includes("t('bills.originalValue')"));
  assert.ok(monthly.includes("t('bills.paidSoFar')"));
});

test('financial marketing advertises reports rather than removed card manager',()=>{
  const landing=file('src/components/FinanceLanding.tsx');
  const translations=file('src/i18n/landing.ts');
  const financeMeta=file('src/app/financeiro/page.tsx');
  assert.ok(landing.includes('key:"reports"'));
  assert.ok(!landing.includes('key:"cards"'));
  assert.equal((translations.match(/"landing\.features\.reports":/g)||[]).length,6);
  assert.equal((translations.match(/"landing\.features\.reportsText":/g)||[]).length,6);
  assert.ok(!/cartões, reservas|cards, savings|tarjetas, reservas|vos cartes, votre épargne|Karten, Rücklagen|البطاقات والاحتياطي/.test(translations));
  assert.ok(!financeMeta.includes('cartões e parcelas'));
});

test('SEO page no longer advertises card functionality but preserves trial disclosure',()=>{
  const page=file('src/app/controle-financeiro-autonomo/page.tsx');
  assert.ok(!page.includes('controle limite, fechamento'));
  assert.ok(!page.includes('Posso controlar cartão de crédito?'));
  assert.ok(page.includes('sem cartão e sem cobrança automática'));
});
