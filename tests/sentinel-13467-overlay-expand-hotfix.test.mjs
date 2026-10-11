import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const path=new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url);
const source=fs.readFileSync(path,'utf8');
const html=String.raw`<section style="display:grid;grid-template-rows:15px 26px 68px 47px 27px auto">
  <details data-sentinel-preserve-open="1"><summary data-sentinel-no-drag="1">Detalhes da entrada futura</summary><div>Conteúdo inicial</div></details>
</section>
<details data-sentinel-preserve-open="1" data-sentinel-vnext-horizon-matrix>
 <summary data-sentinel-no-drag="1">OUTRAS ENTRADAS FUTURAS · expandir</summary><div>Opções iniciais</div>
</details>`;
const start=source.indexOf('const reconcile=(parent,nextParent)=>{');
const end=source.indexOf('reconcile(el,template.content);',start);
assert.ok(start>0&&end>start);
const actualReconcile=source.slice(start,end);
const install=new Function('Node',actualReconcile+'; return reconcile;');
const dragStart=source.indexOf('let drag=null;'),dragEnd=source.indexOf("el.addEventListener('pointermove',ev=>{",dragStart);
assert.ok(dragStart>0&&dragEnd>dragStart);
const actualDragDown=source.slice(dragStart,dragEnd);
const installDrag=new Function('el','localStorage','window',actualDragDown);
const make=()=>{
 const dom=new JSDOM('<div id="host">'+html+'</div>',{pretendToBeVisual:true,url:'https://sentinel.test/'});
 const el=dom.window.document.getElementById('host');
 Object.defineProperty(el,'getBoundingClientRect',{value:()=>({left:0,top:0,right:700,bottom:560})});
 el.setPointerCapture=()=>{el.dataset.captureCount=String(Number(el.dataset.captureCount||0)+1)};
 el.focus=()=>{};
 installDrag(el,dom.window.localStorage||{},dom.window);
 return {dom,el};
};
test('actual 67 overlay click handlers do not steal mouse/touch pointerdown on details summaries',()=>{
 const {dom,el}=make();
 const buttons=el.querySelectorAll('summary');
 assert.equal(buttons.length,2);
 for(const summary of buttons){
  el.dataset.captureCount='0';
  summary.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true,button:0,clientX:100,clientY:100}));
  assert.equal(el.dataset.captureCount,'0','details must not be dragged instead of opened');
  summary.click();
  assert.equal(summary.parentElement.open,true,'native summary click must open');
 }
});
test('real DOM reconciliation preserves both expanded panels across repeated 1-second live updates',()=>{
 const {dom,el}=make(),reconcile=install(dom.window.Node);
 const summaries=el.querySelectorAll('summary');
 for(const summary of summaries)summary.click();
 for(let i=0;i<6;i++){
  const tpl=dom.window.document.createElement('template');
  tpl.innerHTML=html.replace('Conteúdo inicial','Atualização '+i).replace('Opções iniciais','Novas opções '+i);
  reconcile(el,tpl.content);
  const details=el.querySelectorAll('details');
  assert.equal(details.length,2);
  assert.ok(details[0].open,'first details must stay open after refresh '+i);
  assert.ok(details[1].open,'other future entries must stay open after refresh '+i);
  assert.ok(el.textContent.includes('Atualização '+i));
  assert.ok(el.textContent.includes('Novas opções '+i));
 }
});
test('expanded future-entry details can grow and keyboard toggling is not hijacked by the panel',()=>{
 assert.match(source,/grid-template-rows:15px 26px 68px 47px 27px auto;gap:6px/);
 assert.ok(source.includes("'button,select,input,textarea,summary,details,[contenteditable"));
 assert.ok(source.includes('data-sentinel-preserve-open="1" data-sentinel-vnext-horizon-matrix'));
 assert.ok(source.includes('data-sentinel-no-drag="1"'));
 assert.ok(!source.includes('grid-template-rows:15px 26px 68px 47px 27px 25px;gap:6px'));
});
