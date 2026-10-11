import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SignedLiveBridge} from '../sentinel-trading-lab/agent/worker/signed-live-bridge.mjs';
import {fitAnalystFrame} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
const read=p=>readFile(new URL('../sentinel-trading-lab/'+p,import.meta.url),'utf8');
const now=1800000000000,asset='EUR/USD OTC';
function buildFrame(extraLength=0){
 const receipt={engineId:'automatic',asset,side:'CALL',referencePrice:1.10001,issuedAt:now,
  targetAt:now+30000,expirySeconds:30,projectedPrice:1.10018};
 return {
  v:1,at:now,seq:0,lastEvalMs:now,state:'running',agentVersion:'13.4.64',
  settings:{engine:'automatic',orderDurationMs:30000},
  liveBroker:{symbol:asset,validatedSymbol:asset,assetValidated:true,analysisFeedValidated:true,
    lastQuoteAt:now,quote:1.10001},
  feed:{price:1.10001,quoteTs:now},
  lastResult:{asset,analysis:{
    operationalSignal:{side:'WAIT',actionable:false,reason:'info'.repeat(extraLength)},
    vnext:{engineId:'automatic',expirySeconds:30,receipt,targetAnchor:receipt,
      projection:{side:'CALL',callPct:70,putPct:30},
      targetProjection:{side:'PUT',callPct:40,putPct:60},
      nowIndication:{asset,side:'CALL',kind:'support-reaction',at:now,expiresAt:now+3000},
      lastSettled:{engineId:'automatic',side:'PUT',referencePrice:1.10001,
        settledPrice:1.1,notes:'details'.repeat(extraLength)},
      cards:[{id:'market-now',side:'CALL',callPct:70,putPct:30},
       {id:'prior-structure',side:'PUT',callPct:40,putPct:60},
       {id:'total-of-totals',side:'CALL',callPct:55,putPct:45}]
    }
  }}
 };
}
test('oversized optional VNext detail never drops the full real-time quote and live forecast',()=>{
 const frame=buildFrame(1200);
 assert.ok(Buffer.byteLength(JSON.stringify(frame))>3000);
 const compact=fitAnalystFrame(frame);
 assert.ok(compact);
 assert.ok(Buffer.byteLength(JSON.stringify(compact))+73<=3000);
 assert.equal(compact.liveBroker.lastQuoteAt,now);
 assert.equal(compact.liveBroker.quote,1.10001);
 assert.equal(compact.lastResult.analysis.vnext.receipt.side,'CALL');
 assert.equal(compact.lastResult.analysis.vnext.projection.callPct,70);
 assert.equal(compact.lastResult.analysis.vnext.cards.length,3);
 assert.equal(compact.lastResult.analysis.operationalSignal.actionable,false);
});
test('signed mobile frame still fits 3000 bytes after signing, even when details explode',()=>{
 const sent=[];
 const b=new SignedLiveBridge('realtime:sentinel-'+'b'.repeat(48),'c'.repeat(64),{clock:()=>now});
 b.joined=true;b.verifiedViewerAt=now;b.socket={readyState:1,send:s=>sent.push(JSON.parse(s))};
 assert.equal(b.publish(buildFrame(1200)),true);
 const published=sent[0].payload.payload;
 assert.ok(Buffer.byteLength(JSON.stringify(published))<=3000);
 assert.equal(published.sig.length,64);
 assert.equal(published.lastResult.analysis.vnext.projection.putPct,30);
 assert.equal(published.liveBroker.lastQuoteAt,now);
 b.close();
});
test('normal mobile and floating mobile keep last prediction visible but label it delayed',async()=>{
 const [card,model,page]=await Promise.all([
  read('src/components/LiveScenarioCard.tsx'),read('src/lib/live-card-model.ts'),read('src/app/console/page.tsx')
 ]);
 assert.equal((card.match(/\{forecastReceipt\}/g)||[]).length,2);
 assert.match(card,/const forecastReadable=!!\(liveForecast/);
 assert.match(card,/const liveForecastValid=!!\(forecastReadable&&m\.fresh/);
 assert.match(card,/const forecastDelayed=forecastReadable&&!liveForecastValid/);
 assert.match(card,/ÚLTIMA PREVISÃO · ATRASADA/);
 assert.match(card,/liveProjection=forecastReadable\?m\.vnextProjection:null/);
 assert.match(card,/m\.quoteAgeAtFrame/);
 assert.match(card,/m\.transportAge/);
 assert.match(model,/const quoteFresh=quoteAt>0&&now-quoteAt<=2500/);
 assert.match(model,/const transportAge=s\?\.liveTransport==='push'/);
 assert.match(page,/liveQuoteAgeAtFrame:Number\(payload\.liveBroker\?\.lastQuoteAt\)>0/);
 assert.doesNotMatch(card,/vnextNowObservation|instantObservation|opposingObserved/);
});
