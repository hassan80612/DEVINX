import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const worker=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
const web=readFileSync(new URL('../sentinel-trading-lab/src/app/console/page.tsx',import.meta.url),'utf8');

test('PC overlay disclosure summaries are excluded from dragging and keyboard interception',()=>{
 assert.match(worker,/closest\?\.\('button,select,input,textarea,a,label,summary,details,/);
 assert.match(worker,/closest\?\.\('button,select,input,textarea,summary,details,/);
 assert.ok(worker.includes('el.setPointerCapture(ev.pointerId)'));
});
test('future entry details have expandable layout and survive repeated DOM reconciliation',()=>{
 assert.match(worker,/grid-template-rows:15px 26px 68px 47px 27px auto;/);
 assert.match(worker,/<details data-sentinel-preserve-open="1"[^>]*>[\s\S]*?Detalhes da entrada futura/);
 assert.match(worker,/<details data-sentinel-vnext-horizon-matrix data-sentinel-preserve-open="1"/);
 assert.ok(worker.includes("attr.name==='open'&&current.matches?.('details[data-sentinel-preserve-open]')"));
});
test('all primary PC and site visual labels use Estratégia instead of Motor',()=>{
 assert.ok(worker.includes('ESTRATÉGIA ATIVA'));
 assert.ok(worker.includes('Estratégia: \${esc(d.engine)}'));
 assert.ok(!worker.includes('MOTOR ATIVO'));
 assert.ok(!worker.includes('Motor: \${esc(d.engine)}'));
 assert.ok(web.includes("label:'Estratégias'"));
 assert.ok(web.includes('Estratégia ativa'));
 assert.ok(web.includes('ESTRATÉGIA INDEPENDENTE'));
 assert.ok(!web.includes("label:'Motores'"));
 assert.ok(!web.includes('Motor em uso'));
});
