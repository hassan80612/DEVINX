import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { analyzeMarket } from '../sentinel-trading-lab/agent/src/core/strategy.mjs';
import { DemoTradingRuntime } from '../sentinel-trading-lab/agent/src/core/runtime.mjs';

function closedTrend({count=180,start=4200,step=.16,now=Date.now()}={}){
  const base=Math.floor(now/1000)-count*60;
  return Array.from({length:count},(_,i)=>{
    const center=start+i*step+Math.sin(i/8)*.12;
    return {from:base+i*60,to:base+(i+1)*60,open:center-.04,high:center+.16,low:center-.13,close:center+.07,volume:100+(i%13)}
  })
}

test('V4.1 future model carries multi-window closed-candle history into every horizon',()=>{
  const now=Date.now(),candles=closedTrend({now}),last=candles.at(-1).close;
  const quoteHistory=Array.from({length:70},(_,i)=>({ts:now-(69-i)*1000,price:last+(i-69)*.01}));
  const a=analyzeMarket({candles,quoteHistory,strategy:'trend',minConfidence:70,durationMs:60000,freshnessMs:5000,quoteTs:now,now});
  assert.equal(a.entryPlanner.modelVersion,'future-v4.1');
  assert.ok(a.metrics.historyContext);
  assert.ok(Array.isArray(a.metrics.historyContext.legs));
  assert.ok(a.metrics.historyContext.legs.length>=2);
  for(const h of ['30','60','120','300','600','900','3600']){
    const p=a.entryPlanner.horizons[h];
    assert.ok(p, h);
    assert.equal(p.modelVersion,'future-v4.1');
    assert.ok(p.evidenceFamilies?.history,'history evidence missing '+h);
  }
});

test('strategy display still avoids fake 100/0 from sparse evidence',()=>{
  const rt=new DemoTradingRuntime({seed:13,balance:10000});
  const p=rt._strategyPercentages(28,0);
  assert.ok(p.callPct>55&&p.callPct<75,JSON.stringify(p));
  assert.ok(p.putPct>25&&p.putPct<45,JSON.stringify(p));
});

test('Future overlay opens the forecast window immediately and keeps expiration advisory',async()=>{
  const ui=await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
  assert.ok(ui.includes('sentinel-future-decision-v13|'));
  assert.ok(!ui.includes("operationalHeroSide+' EM '+operationalWaitSeconds+'s'"));
  assert.ok(ui.includes("operationalHeroSide+' — ENTRAR AGORA'"));
  assert.ok(ui.includes('JANELA ABERTA'));
  assert.ok(ui.includes('FORÇA CONTRÁRIA'));
  assert.ok(ui.includes('const forecastLabel=futureDecision?'));
  assert.ok(ui.includes('operationalMatchesForecast'));
  assert.ok(ui.includes('operationalMismatch'));
  assert.ok(ui.includes("operationalMismatch?'REVALIDANDO LADO'"));
  assert.ok(ui.includes("operationalHeroSide==='CALL'?callTone:putTone"));
  assert.ok(!ui.includes("['JANELA PERDIDA','JANELA ENCERRADA','INVALIDADO','AJUSTAR TEMPO','AJUSTAR PRAZO']"));
  assert.ok(ui.includes('a expiração não controla a abertura da janela.'));
  assert.ok(ui.includes('data-sentinel-plan-horizon'));
  assert.ok(ui.includes('data-sentinel-setting="duration"'));
  assert.ok(ui.includes('data-sentinel-setting="minConfidence"'));
  assert.ok(ui.includes('data-sentinel-future-threshold'));
  assert.ok(!ui.includes('MOSTRAR CALL / PUT A PARTIR DE'));
  assert.ok(ui.includes('MÉDIA DOS 3 TOTAIS'));
  assert.ok(ui.includes('CONF MÉDIA'));
  assert.ok(ui.includes('data-sentinel-total-threshold="market"'));
  assert.ok(ui.includes('data-sentinel-total-threshold="strategy"'));
  assert.ok(ui.includes('data-sentinel-op-threshold'));
  assert.ok(!ui.includes('Motores: '));
  assert.ok(!ui.includes('Cenário em formação:'));
  assert.ok(ui.includes('Entrada somente quando o Sinal Operacional confirmar o gatilho.'));
  assert.ok(ui.includes('sentinelMetalSweep'));
  assert.ok(ui.includes('sentinel-metal-gold'));
  assert.ok(ui.includes("ev.key==='ArrowDown'"));
  assert.ok(ui.includes("ev.key==='PageDown'"));
  assert.ok(ui.includes('plannerMatchesAsset'));
  assert.ok(ui.includes('plannerFreshAfterAssetSwitch'));
  assert.ok(ui.includes("startsWith('sentinel-future-decision-v13|')"));
  assert.ok(ui.includes("startsWith('sentinel-future-expired-v13|')"));
  assert.ok(ui.includes('sameExpiredSide'));
  assert.ok(ui.includes('CALL — confirmação'));
  assert.ok(ui.includes('PUT — confirmação'));
});
