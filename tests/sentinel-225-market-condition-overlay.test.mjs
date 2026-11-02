import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {marketConditionEvidence,smoothMarketCondition,marketConditionLabel}
 from '../sentinel-trading-lab/agent/worker/market-condition-indicator.mjs';
import {executorMonitor} from '../sentinel-trading-lab/agent/worker/executor-panel.mjs';
import {PREMIUM_OVERLAY_CSS} from '../sentinel-trading-lab/agent/worker/premium-overlay-controls.mjs';
const live=()=>({state:'running',durationMs:60000,engine:'automatic',asset:'EUR/USD OTC',liveAgeMs:800,analysisAgeMs:700,
 quality:{entryReady:true},vnext:{nowObservation:{ready:true,side:'CALL',reason:'confirmed-level-structure-reversal',marketPhase:'directional'}},
 metrics:{buyScore:78,sellScore:21},finalConfluence:{side:'CALL'},generalConsensus:{rapid:{side:'CALL'}}});
test('225: independent live analyst evidence, never claim guaranteed win',()=>{
 const good=marketConditionEvidence(live(),1000);
 assert.equal(good.state,'good');
 assert.match(good.reason,/analista/);
 const conflicting=live();
 conflicting.quality.entryReady=false;
 conflicting.vnext.nowObservation.ready=false;
 conflicting.generalConsensus.rapid.side='PUT';
 assert.equal(marketConditionEvidence(conflicting).state,'watch');
 const blocked=live();blocked.vnext.nowObservation.entryRisk={blocked:true};
 assert.equal(marketConditionEvidence(blocked).state,'bad');
 const stale=live();stale.liveAgeMs=6000;
 assert.equal(marketConditionEvidence(stale).state,'sync');
 assert.equal(marketConditionEvidence({...live(),state:'stopped'}).state,'sync');
});
test('225: one-tick readout cannot flip good to bad and vice versa',()=>{
 const good=marketConditionEvidence(live());
 let v=smoothMarketCondition(null,good,{at:1000,context:'exnova|EURUSD|60000'});
 assert.equal(v.state,'watch');
 v=smoothMarketCondition(v,good,{at:2000,context:'exnova|EURUSD|60000'});
 assert.equal(v.state,'watch');
 v=smoothMarketCondition(v,good,{at:4100,context:'exnova|EURUSD|60000'});
 assert.equal(v.state,'watch','226: early 3-second fluctuations do not make chart favorable');
 v=smoothMarketCondition(v,good,{at:9500,context:'exnova|EURUSD|60000'});
 assert.equal(v.state,'good','226: 8 seconds of sustained evidence may promote the chart');
 const bad=marketConditionEvidence({...live(),vnext:{nowObservation:{ready:false,side:null,reason:'shared-base-verified-wall-exhaustion'}}});
 v=smoothMarketCondition(v,bad,{at:9700,context:'exnova|EURUSD|60000'});
 assert.equal(v.state,'watch','unsafe quote immediately removes favorable status');
 v=smoothMarketCondition(v,good,{at:9900,context:'exnova|EURUSD|60000'});
 assert.equal(v.state,'watch','instant rebound cannot restore favorable');
 v=smoothMarketCondition(v,good,{at:14500,context:'exnova|EURUSD|60000'});
 assert.equal(v.state,'watch');
 v=smoothMarketCondition(v,good,{at:18000,context:'exnova|EURUSD|60000'});
 assert.equal(v.state,'watch','226: elapsed time alone cannot cause a one-tick rebound');
 v=smoothMarketCondition(v,good,{at:18500,context:'exnova|EURUSD|60000'});
 assert.equal(v.state,'good','226: recovery also needs sustained evidence');
 const other=smoothMarketCondition(v,good,{at:19000,context:'exnova|GBPUSD|30000'});
 assert.equal(other.state,'watch','new asset/expiry invalidates the previous favorable readout');
});
test('225: compact fixed-height WIN / market status / Session all stay on the original row',()=>{
 const markup=executorMonitor({sessionWins:2,sessionLosses:1,netPnl:13.25,config:{},enabled:true},'pt',
   {state:'good',reason:'Leituras atuais alinhadas'});
 assert.match(markup,/<b data-sentinel-executor-wl>WIN:/);
 assert.match(markup,/data-sentinel-market-condition data-condition="good"/);
 assert.match(markup,/GRÁFICO: FAVORÁVEL/);
 assert.match(markup,/Sessão: 13\.25/);
 const positions=['data-sentinel-executor-wl','data-sentinel-market-condition','data-sentinel-executor-session'].map(x=>markup.indexOf(x));
 assert.ok(positions[0]<positions[1]&&positions[1]<positions[2]);
 assert.match(PREMIUM_OVERLAY_CSS,/grid-template-columns:minmax\(0,1\.04fr\) minmax\(0,1\.08fr\) minmax\(0,\.97fr\)/);
 assert.match(PREMIUM_OVERLAY_CSS,/height:36px;min-height:36px;max-height:36px/);
 assert.match(PREMIUM_OVERLAY_CSS,/font:850 11\.7px\/15px system-ui/);
 assert.equal(marketConditionLabel('bad','en'),'UNFAVORABLE');
 const driver=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 assert.match(driver,/payload\.executorMonitorHtml=executorMonitor\(payload\.autoExecutor,payload\.uiLanguage,payload\.graphCondition\)/);
 assert.doesNotMatch(driver,/this\.graphConditionStates\.get\(provider\)[^\n]*execute/);
});
