import test from 'node:test';
import assert from 'node:assert/strict';
import {chosenStrategiesPermit,strategySelectionGuidance} from '../sentinel-trading-lab/agent/src/core/strategy-selection-guidance.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {readFile} from 'node:fs/promises';
const make=(strategy,side,slot=1,evidence=.8)=>({strategy,side,slot,evidence,active:true,paused:false});

test('exactly one selected CALL strategy vetoes opposite PUT without manufacturing CALL',()=>{
 const yes=chosenStrategiesPermit({cards:[make('price_action','CALL')],side:'CALL'});
 const no=chosenStrategiesPermit({cards:[make('price_action','CALL')],side:'PUT'});
 assert.equal(yes.allowed,true);assert.equal(no.allowed,false);assert.equal(no.status,'opposed');
});
test('two opposing strategies fail closed instead of taking majority or averaging to a false signal',()=>{
 const cards=[make('trend','CALL',1),make('mean_reversion','PUT',2)];
 for(const side of ['CALL','PUT'])assert.equal(chosenStrategiesPermit({cards,side}).status,'conflict');
 const g=strategySelectionGuidance({ids:['trend','mean_reversion','none'],cards});
 assert.equal(g.divergence,true);assert.equal(g.level,'conflict');
});
test('three aligned strategies authorize own direction, not a new unverified setup',()=>{
 const cards=[make('trend','CALL',1),make('price_action','CALL',2),make('support_resistance','CALL',3)];
 assert.equal(chosenStrategiesPermit({cards,side:'CALL'}).allowed,true);
 assert.equal(chosenStrategiesPermit({cards,side:'PUT'}).allowed,false);
 const g=strategySelectionGuidance({ids:cards.map(c=>c.strategy),cards});
 assert.equal(g.selectedCount,3);assert.equal(g.overlap,false);assert.equal(g.provenAccuracy,false);
});
test('duplicate and correlated combinations are flagged without silently replacing user selection',()=>{
 assert.equal(strategySelectionGuidance({ids:['trend','trend','none']}).level,'overlap');
 assert.equal(strategySelectionGuidance({ids:['breakout','trendline_breakout','none']}).level,'overlap');
 assert.equal(strategySelectionGuidance({ids:['support_resistance','mean_reversion','none']}).level,'overlap');
 const g=strategySelectionGuidance({ids:['smart_confluence','trend','none']});
 assert.equal(g.overlap,true);assert.deepEqual(g.selected,['smart_confluence','trend']);
});
test('paused or not-yet-qualified selected strategies do not authorize a new entry',()=>{
 assert.equal(chosenStrategiesPermit({cards:[{...make('trend','CALL'),paused:true}],side:'CALL'}).allowed,false);
 assert.equal(chosenStrategiesPermit({cards:[make('trend','CALL',1,.05)],side:'CALL'}).status,'awaiting-strategy');
 assert.equal(chosenStrategiesPermit({cards:[],side:'CALL'}).status,'not-evaluated');
});
test('worker propagates compatibility guidance to the broker card and mobile settings',async()=>{
 const root=new URL('../sentinel-trading-lab/',import.meta.url);
 const worker=await readFile(new URL('agent/worker/index.mjs',root),'utf8');
 const ui=await readFile(new URL('agent/worker/local-playwright-driver.mjs',root),'utf8');
 const mobile=await readFile(new URL('src/components/LiveScenarioCard.tsx',root),'utf8');
 assert.match(worker,/strategyGuidance:a\.strategyGuidance/);
 assert.match(ui,/data-sentinel-strategy-advice/);
 assert.match(mobile,/strategy-selection-advice/);
});
test('runtime tests user's selection rather than only ranking strategy projections',async()=>{
 const root=new URL('../sentinel-trading-lab/',import.meta.url);
 const source=await readFile(new URL('agent/src/core/runtime.mjs',root),'utf8');
 assert.match(source,/chosenStrategiesPermit\(\{cards:analysis\.strategyCards,side:row\.side\}\)/);
 assert.match(source,/row\.blockedBy='selected-strategy'/);
 const r=new DemoTradingRuntime();
 r.settings.strategy='trend';r.settings.strategy2='none';r.settings.strategy3='none';
 assert.equal(r._activeStrategyProfile(),'trend');
 r.patchSettings({strategy:'price_action',strategy2:'support_resistance',strategy3:'none'});
 assert.equal(r._activeStrategyProfile(),'price_action+support_resistance');
 r.patchSettings({pausedReadings:{strategy_2:true}});
 assert.equal(r._activeStrategyProfile(),'price_action');
});
