import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const BASE='16fdc0dc2471b7a4ef5799526891adff52f1903d';
function checked(path,clean){
 const earlier=execFileSync('git',['show',BASE+':'+path],{encoding:'utf8'});
 const current=readFileSync(path,'utf8');
 const normalized=clean(current);
 assert.equal(normalized,earlier,'Only the surgical 217 change is allowed in '+path);
}
test('217: entire original 216 runtime preserved except one import and bounded final review',()=>{
 checked('sentinel-trading-lab/agent/src/core/runtime.mjs',s=>
  s.replace("import {reviewExtremeBoundarySide} from './extreme-boundary-review.mjs';\n",'')
   .replace(/      \/\/ 217: One narrowly defined exhaustion[\s\S]*?(?=      \/\/ 216: bounded reason)/,''));
});
test('217: existing entry families unchanged except the new narrow counterturn',()=>{
 checked('sentinel-trading-lab/agent/src/core/entry-family.mjs',s=>
  s.replace(",'extreme-boundary-opposite'",''));
});
test('217: original broker executor unchanged except explicit guarded account resync',()=>{
 checked('sentinel-trading-lab/agent/worker/signal-executor.mjs',s=>
  s.replace(/ resetForAccountSwitch\(\)\{[\s\S]*?\n \}\n(?= observeBalance)/,''));
});
test('217: worker unchanged except browser mode field and explicit reset route',()=>{
 checked('sentinel-trading-lab/agent/worker/index.mjs',s=>
  s.replace('brokerMode:st?.mode||null,','')
   .replace(/ if\(action==='executor-reset-account'\)\{[\s\S]*?\n \}\n(?= if\(action==='executor-map')/,''));
});
test('217: only account sync button and its action were added to original bot card',()=>{
 checked('sentinel-trading-lab/src/components/BotControl.tsx',s=>
  s.replace(/   if\(action==='resync'\)\{[\s\S]*?\n   \}\n   else if\(action==='start'\)/,"   if(action==='start')")
   .replace(/    <button className="secondary" disabled=\{!online\|\|!!pending\|\|bot.arming\|\|!current\|\|bot.executing\|\|!!bot.pending\} onClick=\{\(\)=>void run\('resync'\)\}>[\s\S]*?<\/button>\n/,''));
});
