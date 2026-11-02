import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {marketReading} from '../sentinel-trading-lab/agent/src/core/market-reading.mjs';
import {lastTrustedExpiryForResume} from '../sentinel-trading-lab/agent/worker/native-expiry-resume-228.mjs';
import {assessDirectionalPersistence} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {unifiedMarketEvidence227} from '../sentinel-trading-lab/agent/src/core/unified-market-evidence-227.mjs';
const at=1800000000000;
test('228: sparse live price gaps cannot force the display into endless ANALISANDO ESTRUTURA when historical indicators exist',()=>{
 const quotes=Array.from({length:8},(_,i)=>({
  ts:at-(7-i)*3000,price:1.101+i*.00001,receivedAt:at-(7-i)*3000
 }));
 const candles=Array.from({length:80},(_,i)=>{
  const from=at-(80-i)*60000,close=1.10+i*.000015;
  return{from,to:from+60000,open:close-.000005,high:close+.000018,
   low:close-.000016,close,receivedAt:from+60000};
 });
 const persistence=assessDirectionalPersistence({quoteHistory:quotes,quoteAt:at,now:at,
  price:quotes.at(-1).price,durationMs:60000});
 assert.equal(persistence.phase,'insufficient');
 const indicators=unifiedMarketEvidence227({candles,quoteHistory:quotes,quoteAt:at,
  now:at,price:quotes.at(-1).price});
 assert.equal(indicators.ready,true);
 assert.equal(indicators.trendSide,'CALL');
 const read=marketReading({phase:persistence.phase,label:'OBSERVANDO',
  candidate:{ready:false,reason:'completed-structure-not-ready'},indicatorEvidence:indicators,
  historicalCandlesVerified:true});
 assert.match(read,/TENDÊNCIA DE FUNDO.*CALL/);
 assert.doesNotMatch(read,/ANALISANDO ESTRUTURA/);
});
test('228: quote too old, invalid history, genuine range or current confirmed reversal are honestly distinguished',()=>{
 const indicatorEvidence={ready:true,trendSide:'CALL',adx:28};
 assert.equal(marketReading({phase:'insufficient',candidate:{reason:'stale-live-quote'},
  indicatorEvidence}),'AGUARDANDO COTAÇÃO ATUAL');
 assert.equal(marketReading({phase:'insufficient',candidate:{reason:'completed-structure-not-ready'},
  historicalCandlesVerified:false,indicatorEvidence}),'HISTÓRICO NÃO VALIDADO');
 assert.equal(marketReading({phase:'insufficient',candidate:{reason:'completed-structure-not-ready'}}),
  'COLETANDO MICROESTRUTURA');
 assert.equal(marketReading({phase:'insufficient',candidate:{reason:'choppy-sideways-structure'},
  indicatorEvidence}),'MERCADO LATERAL');
 assert.equal(marketReading({phase:'reversal-confirmed',candidate:{ready:true,side:'PUT',
  reason:'confirmed-level-structure-reversal'},indicatorEvidence}),'REVERSÃO CONFIRMADA · PUT');
});
test('228: last persisted native 1m/5m always beats an unchosen browser 30s after refresh',()=>{
 const now=Date.now();
 assert.equal(lastTrustedExpiryForResume({
  nativeDurationMs:60000,nativeSelectedAt:now-1000,currentDurationMs:30000}),60000);
 assert.equal(lastTrustedExpiryForResume({
  nativeDurationMs:300000,nativeSelectedAt:now-500,currentDurationMs:30000}),300000);
 assert.equal(lastTrustedExpiryForResume({
  nativeDurationMs:30000,nativeSelectedAt:now-100,currentDurationMs:60000}),30000,
  'a genuine newer manual 30s choice must remain selectable');
 assert.equal(lastTrustedExpiryForResume({
  nativeDurationMs:30000,nativeSelectedAt:0,currentDurationMs:60000}),null,
  'broker default 30s is never a trusted choice');
 assert.equal(lastTrustedExpiryForResume({
  nativeDurationMs:60000,nativeSelectedAt:now-100,currentDurationMs:30000,
  changedDuringRecovery:true}),null,'never override a newer manual setting during recovery');
 assert.equal(lastTrustedExpiryForResume({
  nativeDurationMs:60000,nativeSelectedAt:now-100,currentDurationMs:60000}),null);
});
test('228: restored native choice never changes expiry setter except at startup; core execution has no new gates',()=>{
 const base=new URL('../sentinel-trading-lab/',import.meta.url);
 const worker=readFileSync(new URL('agent/worker/index.mjs',base),'utf8');
 const picker=readFileSync(new URL('agent/worker/broker-native-expiry-keeper.mjs',base),'utf8');
 const runtime=readFileSync(new URL('agent/src/core/runtime.mjs',base),'utf8');
 assert.match(worker,/restore-last-trusted-native-expiry/);
 assert.match(worker,/nativeExpirySeedAttempted/);
 assert.match(worker,/nativeSelectedAt:driver\.nativeExpirySelectedAt\.get\(provider\)/);
 assert.match(picker,/const defaultRollback=current===30000&&preferredMs!==30000/);
 assert.match(runtime,/allowVerifiedEarlyReversal:true/);
});
