import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewPreviousClosedCandlePrice} from '../sentinel-trading-lab/agent/src/core/previous-closed-price-admission.mjs';
import {verifyBrokerExpiryForOrder} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
const T=1800000060000;
const q=arr=>arr.map((price,i)=>({ts:T-(arr.length-1-i)*1000,receivedAt:T,price}));
const bars=arr=>arr.map(([open,high,low,close],i)=>({
 from:T-1000-(arr.length-i)*60000,to:T-1000-(arr.length-i-1)*60000,
 open,high,low,close,receivedAt:T
}));
const check=(side,reason,price,closed,quotes,durationMs=60000)=>{
 const candidate={ready:true,side,reason,entryPrice:price,observedAt:T};
 return reviewPreviousClosedCandlePrice({candidate,candles:bars(closed),quoteHistory:q(quotes),
  price,quoteAt:T,now:T,durationMs});
};
// Closed-candle and quote values below are copied from the user's 13.9.194
// broker audit, BEFORE each click. No closing price/outcome enters the gate.
const recorded194=[
 ['CALL','confirmed-level-structure-reversal',.830435,
  [[.830465,.830475,.830175,.830265],[.830285,.830395,.830155,.830395],[.830415,.830445,.830315,.830385]],
  [.830355,.830355,.830385,.830385,.830375,.830405,.830435],'loss'],
 ['CALL','closed-range-extreme-reversal-confirmed',.830345,
  [[.830415,.830445,.830315,.830385],[.830375,.830505,.830345,.830465],[.830455,.830535,.830295,.830335]],
  [.830335,.830335,.830335,.830325,.830325,.830335,.830345],'loss'],
 ['CALL','multiscale-candle-rejection',.830205,
  [[.830375,.830505,.830345,.830465],[.830455,.830535,.830295,.830335],[.830345,.830345,.830195,.830245]],
  [.830245,.830215,.830225,.830215,.830185,.830195,.830205],'loss'],
 ['PUT','closed-structure-and-live-impulse',.829815,
  [[.830455,.830535,.830295,.830335],[.830345,.830345,.830195,.830245],[.830225,.830255,.830055,.830115]],
  [.829895,.829855,.829855,.829845,.829855,.829845,.829815],'loss'],
 ['CALL','multiscale-candle-rejection',.829825,
  [[.830225,.830255,.830055,.830115],[.830155,.830175,.829815,.829885],[.829845,.829985,.829795,.829805]],
  [.829815,.829805,.829785,.829775,.829775,.829795,.829825],'win'],
 ['CALL','closed-structure-and-live-impulse',.830175,
  [[.830155,.830175,.829815,.829885],[.829845,.829985,.829795,.829805],[.829785,.830125,.829765,.830095]],
  [.830105,.830105,.830075,.830085,.830095,.830125,.830175],'loss'],
 ['CALL','multiscale-candle-rejection',.829775,
  [[.829845,.829985,.829795,.829805],[.829785,.830125,.829765,.830095],[.830085,.830175,.830015,.830025]],
  [.829775,.829775,.829785,.829785,.829735,.829765,.829775],'loss'],
 ['PUT','closed-structure-and-live-impulse',.829275,
  [[.830085,.830175,.830015,.830025],[.830075,.830075,.829625,.829665],[.829675,.829715,.829465,.829475]],
  [.829345,.829365,.829375,.829335,.829335,.829275,.829275],'loss'],
 ['PUT','closed-range-extreme-reversal-confirmed',.829335,
  [[.830075,.830075,.829625,.829665],[.829675,.829715,.829465,.829475],[.829465,.829515,.829105,.829245]],
  [.829405,.829385,.829385,.829375,.829385,.829375,.829335],'pending']
];
test('real 194 audit price-before-click replay: at least seven of eight known trades fail price qualification',()=>{
 let blockedLoss=0,blockedWin=0;
 for(const [side,reason,price,candles,quotes,result] of recorded194){
  const checked=check(side,reason,price,candles,quotes);
  assert.notEqual(checked.side,side==='CALL'?'PUT':'CALL','a veto never manufactures opposite order');
  if(!checked.ready&&result==='loss')blockedLoss++;
  if(!checked.ready&&result==='win')blockedWin++;
 }
 assert.ok(blockedLoss>=7,'should reject recorded 194 loss contexts where entry price contradicted past candles');
 assert.ok(blockedWin<=1,'reference 194 batch contained exactly one completed WIN');
});
test('a genuine breakout with a previously observed price route is not treated as mere wick',()=>{
 const closed=[[100,100.25,99.85,100.15],[100.12,100.36,99.99,100.31],[100.3,100.4,100.2,100.38]];
 const quotes=[100.35,100.37,100.39,100.41,100.43,100.45,100.47];
 assert.equal(check('CALL','historical-level-breakout',100.47,closed,quotes).ready,true);
});
test('not enough CLOSED history or stale live tick cannot authorize a new automatic trade',()=>{
 const candle=[[100,100.2,99.9,100.15]],quotes=[100.01,100.02,100.03,100.04,100.05,100.06,100.07];
 const s=check('CALL','closed-structure-and-live-impulse',100.07,candle,quotes);
 assert.equal(s.ready,false);assert.equal(s.reason,'entry-missing-previous-closed-candle-price');
});
test('5-minute structural reversal remains governed by its own unchanged gate',()=>{
 const candidate={ready:true,side:'PUT',reason:'confirmed-level-structure-reversal',
  entryPrice:100,observedAt:T};
 assert.equal(reviewPreviousClosedCandlePrice({candidate,quoteAt:T,now:T,price:100,durationMs:300000}),candidate);
});
test('automatic broker click requires real native period, manual mode and START are untouched',()=>{
 for(const ms of [30000,60000,300000]){
  assert.equal(verifyBrokerExpiryForOrder({inspection:{preferredMs:ms,currentMs:ms},requiredDurationMs:ms}).allowed,true);
  assert.equal(verifyBrokerExpiryForOrder({inspection:{preferredMs:ms,currentMs:null},requiredDurationMs:ms}).allowed,false);
  assert.equal(verifyBrokerExpiryForOrder({inspection:{preferredMs:ms,currentMs:30000},requiredDurationMs:ms}).allowed,ms===30000);
 }
 assert.equal(verifyBrokerExpiryForOrder({inspection:{currentMs:null},requiredDurationMs:60000,automatic:false}).allowed,true);
});
