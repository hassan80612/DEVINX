import {closedPriceBars} from './closed-price-bars.mjs';
const valid=n=>n!=null&&Number.isFinite(Number(n));
// This module knows only the scenario's own planner and raw market prices.
// It cannot consult the subanalyst, authorize an entry or invert a forecast.
export function reviewScenario(main,plan,snap,now,{threshold,minPoints}={}){
  const fresh=valid(snap.quoteTs)&&Number(snap.quoteTs)<=now&&now-Number(snap.quoteTs)<=2500;
  if(!fresh)return{state:'REAVALIANDO',code:'feed',reason:'Aguardando preços atuais.',sourceAt:main.review?.sourceAt||0};
  const bars=closedPriceBars(snap,now),last=bars.at(-1);
  if(!last||last.to<=main.createdAt||last.to<=Number(main.review?.sourceAt||0))return main.review||{state:'OPEN',code:'initial',sourceAt:0};
  const side=String(plan?.rawBias||plan?.bias||'NEUTRO'),lead=Number(side==='CALL'?plan?.callProbability:plan?.putProbability);
  // Admission limits belong to a NEW forecast, not to its lifetime. The
  // planner must still support the direction with fresh, safe own evidence.
  const readable=plan?.outlookReady===true&&['CALL','PUT'].includes(side)&&lead>50;
  const supported=readable&&plan.directionReady===true&&plan.safety?.blocked!==true;
  const current={side,confidence:Number(plan?.confidence||0),callPct:Number(plan?.callProbability??50),putPct:Number(plan?.putProbability??50)};
  const base={sourceAt:last.to,current};
  if(!supported||side!==main.side){
    const chain=bars.slice(-5),approach=chain.slice(0,-2),broken=chain.at(-2),held=chain.at(-1);
    const sign=main.side==='CALL'?-1:1;
    const ranges=approach.map(b=>b.high-b.low).sort((a,b)=>a-b);
    const buffer=Math.max(Math.abs(Number(snap.price))*.000002,Number(ranges[1]||0)*.12,1e-9);
    // Break the preceding structure, not merely the most recent small bar.
    // This preserves an ordinary retracement inside the existing swing.
    const level=sign<0?Math.min(...approach.map(b=>b.low)):Math.max(...approach.map(b=>b.high));
    const continuous=chain.length===5&&chain.every((b,i)=>!i||b.from===chain[i-1].to);
    // Retiring a broken structure is independent of qualifying a NEW opposite
    // forecast. Never manufacture an opposite entry from this evidence.
    const opposed=readable&&side!==main.side&&continuous&&broken.from>=main.createdAt&&
      (broken.close-level)*sign>buffer&&(held.close-broken.close)*sign>=buffer&&
      (sign<0?held.high<=level+buffer&&held.high<broken.high:held.low>=level-buffer&&held.low>broken.low)&&
      (Number(snap.price)-level)*sign>buffer;
    if(opposed)return{...base,state:'INVALIDADO',code:'own-reversal',reason:'Virada contrária confirmada pelo Cenário.',evidence:{level,buffer,breakAt:broken.to,holdAt:held.to,breakClose:broken.close,holdClose:held.close}};
    return{...base,state:'REAVALIANDO',code:readable&&side!==main.side?'opposition':plan?.outlookReady===true?'weak':'input',reason:readable&&side!==main.side?'O Cenário identificou movimento contrário.':plan?.outlookReady===true?'A previsão perdeu força.':'Atualizando a base da previsão.'};
  }
  return{...base,state:'OPEN',code:'supported',reason:'Previsão mantida.'};
}

// Prospectively refuse a forecast whose OWN evidence already opposes it.
// No new opposite side is manufactured from exhaustion alone.
export function scenarioAdmission(plan,metrics={}){
  const side=String(plan?.rawBias||plan?.bias||'NEUTRO'),call=side==='CALL',sign=call?1:-1;
  const short=metrics.shortModel||{},micro=metrics.micro||{};
  const stretched=call?short.callStretched:short.putStretched;
  const weakening=call?short.weakeningUp:short.weakeningDown;
  const turning=call?short.turnDown:short.turnUp;
  const reversalRisk=call?short.callReversalRisk:short.putReversalRisk;
  const room=call?short.callRoomOk:short.putRoomOk;
  if(plan?.safety?.blocked===true)return{allowed:false,code:'barrier',reason:'Aguardando espaço para o movimento.'};
  if(short.ready===true){
    if(stretched&&(weakening||turning))return{allowed:false,code:'exhaustion',reason:'Movimento esticado e perdendo força.'};
    // Extension alone is compatible with a strong trend. Refuse a new forecast
    // during an actual opposing micro turn, even before the slower model flips.
    if(turning&&micro.ready===true&&Number(micro.delta5)*sign<0&&!(plan?.scenario?.kind==='reversal'&&plan.scenario.reversalConfirmed===true))return{allowed:false,code:'pullback',reason:'Retração em andamento; aguardando retomada.'};
    if(reversalRisk&&(turning||weakening)&&micro.ready===true&&Number(micro.delta5)*sign<0)return{allowed:false,code:'turn',reason:'O Cenário identificou risco de virada.'};
    if(room===false&&plan?.scenario?.kind!=='breakout')return{allowed:false,code:'room',reason:'Aguardando espaço para o movimento.'};
  }
  if(plan?.scenario?.kind==='reversal'&&plan.scenario.reversalConfirmed!==true&&plan.reaction?.qualified!==true)return{allowed:false,code:'unconfirmed-reversal',reason:'Aguardando confirmação da reversão.'};
  return{allowed:true,code:'eligible'};
}
