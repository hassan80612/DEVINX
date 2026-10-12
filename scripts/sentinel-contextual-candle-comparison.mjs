import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {adaptiveDirectTrajectory} from '../sentinel-trading-lab/agent/src/core/adaptive-direct-trajectory.mjs';
import {contextualCandleTrajectory} from '../sentinel-trading-lab/agent/src/core/contextual-candle-trajectory.mjs';
import {generate} from './sentinel-closed-candle-synthetic-streams.mjs';
const legacyRoot=process.env.SENTINEL_671_CORE;
if(!legacyRoot)throw Error('SENTINEL_671_CORE must point to the preserved 67.1 core');
const {singleEngineForecast}=await import(pathToFileURL(path.resolve(legacyRoot,'vnext-single-engine.mjs')));
const {futureEntrySchedule}=await import(pathToFileURL(path.resolve(legacyRoot,'future-entry-schedule.mjs')));
const H=[5,10,30,60,120,300],PERIOD=60;
const seeds=[1310033,1310051,1310077,1310099];
const kinds=['trend','range','cycle','reversal','false_breakout','breakout','volatility','random','regime_switch','exhaustion'];
const side=(a,b)=>b>a?'CALL':b<a?'PUT':'DRAW';
const valid=s=>s==='CALL'||s==='PUT';
const bucket=()=>({n:0,draws:0,reversalCases:0,
 legacySignals:0,publishedSignals:0,closedSignals:0,legacyWins:0,publishedWins:0,closedWins:0,
 legacyReversalWins:0,publishedReversalWins:0,closedReversalWins:0,
 closedPriceDisagreements:0,closedMissingTrio:0,closedFollowsForming:0,formingConflictsClosed:0,closedWinsOnConflict:0,publishedWinsOnConflict:0,
 extremaCases:0,publishedTopWithin10s:0,closedTopWithin10s:0,publishedBottomWithin10s:0,closedBottomWithin10s:0});
const pct=(a,b)=>b?Number((100*a/b).toFixed(2)):null;
const summary=b=>({...b,...Object.fromEntries(['legacy','published','closed'].flatMap(m=>[
 [m+'AccuracyPct',pct(b[m+'Wins'],b[m+'Signals'])],[m+'CoveragePct',pct(b[m+'Signals'],b.n)],
 [m+'NonDrawAccuracyPct',pct(b[m+'Wins'],b[m+'Signals']-b.draws)],
 [m+'ReversalAccuracyPct',pct(b[m+'ReversalWins'],b.reversalCases)]])),
 publishedTopWithin10sPct:pct(b.publishedTopWithin10s,b.extremaCases),closedTopWithin10sPct:pct(b.closedTopWithin10s,b.extremaCases),
 publishedBottomWithin10sPct:pct(b.publishedBottomWithin10s,b.extremaCases),closedBottomWithin10sPct:pct(b.closedBottomWithin10s,b.extremaCases)});
function barsOf(rows){
 const grouped=new Map();
 for(const q of rows){const from=Math.floor((q.barFrom??q.ts)/(PERIOD*1000))*PERIOD*1000;
  const o=q.open??q.price,h=q.high??q.price,l=q.low??q.price,c=q.price;
  if(!grouped.has(from))grouped.set(from,{from,to:from+PERIOD*1000,receivedAt:from+PERIOD*1000,open:o,high:h,low:l,close:c});
  else{const b=grouped.get(from);b.high=Math.max(b.high,h);b.low=Math.min(b.low,l);b.close=c;}}
 return [...grouped.values()];
}
const extrema=p=>({top:p.reduce((a,b)=>b.price>a.price?b:a),bottom:p.reduce((a,b)=>b.price<a.price?b:a)});
const totals=bucket(),byMode={},byHorizon={},bySource={},byKind={},decisions=[],sources=[];
function evaluate(rows,candles,i,source,kind){
 const history=rows.slice(Math.max(0,i-3599),i+1).map(({ts,price})=>({ts,price})),now=rows[i].ts;
 const snap={quoteHistory:history,quoteTs:now,provider:'archived-comparison'},settings={engine:'automatic',asset:source.split('-')[0]};
 const historicalCandles=candles.filter(c=>c.from>=history[0].ts-3*PERIOD*1000&&c.to<=now);
 for(const mode of ['from-now','future-entry'])for(const h of H){
  const lead=mode==='from-now'?0:h;
  const options={quoteHistory:history,asOf:now,entryDelaySeconds:lead,holdingSeconds:h};
  const legacy=mode==='from-now'?singleEngineForecast({settings:{...settings,orderDurationMs:h*1000},snap,now}).receipt:
   futureEntrySchedule({settings,snap,now,delays:[h]})[0];
  const published=adaptiveDirectTrajectory(options);
  const closed=contextualCandleTrajectory({...options,candles:historicalCandles,candleSeconds:PERIOD});
  assert.equal(published.status,'adaptive-direct-trajectory');assert.equal(closed.status,'contextual-candle-trajectory');
  assert.equal(closed.entryAt,now+lead*1000);assert.equal(closed.exitAt,now+(lead+h)*1000);
  assert.ok(closed.latestTrainingOutcomeAt<=now);
  assert.equal(closed.candleContext.bars.length,3);assert.ok(closed.candleContext.bars.every(c=>c.to<=now&&c.readyAt<=now));
  const truth=side(rows[i+lead].price,rows[i+lead+h].price),prior=side(rows[i-30].price,rows[i].price);
  const trio=historicalCandles.slice(-3),forming=side(trio.at(-1).close,rows[i].price),trioSide=side(trio[0].open,trio[2].close);
  const conflict=valid(forming)&&valid(trioSide)&&forming!==trioSide;
  const actual=extrema(rows.slice(i+lead,i+lead+h+1).map(q=>({price:q.price,secondsFromNow:(q.ts-now)/1000})));
  const pe=extrema(published.expectedPath.filter(p=>p.secondsFromNow>=lead)),ce=extrema(closed.expectedPath.filter(p=>p.secondsFromNow>=lead));
  byMode[mode]??=bucket();byHorizon[mode+':'+h]??=bucket();bySource[source]??=bucket();if(kind)byKind[kind]??=bucket();
  for(const b of [totals,byMode[mode],byHorizon[mode+':'+h],bySource[source],...(kind?[byKind[kind]]:[])]){
   b.n++;b.draws+=truth==='DRAW';const reversed=valid(truth)&&valid(prior)&&truth!==prior;b.reversalCases+=reversed;
   for(const [name,p] of [['legacy',legacy],['published',published],['closed',closed]]){
    b[name+'Signals']+=valid(p?.side);b[name+'Wins']+=p?.side===truth;b[name+'ReversalWins']+=reversed&&p?.side===truth;}
   b.closedPriceDisagreements+=valid(closed.side)&&closed.side!==side(closed.projectedEntryPrice,closed.projectedExitPrice);
   b.closedMissingTrio+=closed.candleContext.bars.length!==3;
   b.closedFollowsForming+=valid(forming)&&closed.side===forming;b.formingConflictsClosed+=conflict;
   b.closedWinsOnConflict+=conflict&&closed.side===truth;b.publishedWinsOnConflict+=conflict&&published.side===truth;
   if(h>=30){b.extremaCases++;
    for(const [name,e] of [['published',pe],['closed',ce]]){
     b[name+'TopWithin10s']+=Math.abs(e.top.secondsFromNow-actual.top.secondsFromNow)<=10;
     b[name+'BottomWithin10s']+=Math.abs(e.bottom.secondsFromNow-actual.bottom.secondsFromNow)<=10;}}
  }
  decisions.push({source,mode,horizon:h,issueAt:now,truth,legacy:legacy?.side,published:published.side,closed:closed.side,
   closedBars:closed.candleContext.bars,latestTrainingOutcomeAt:closed.latestTrainingOutcomeAt});
 }
}
const directory=process.argv[2],output=process.argv[3];
if(directory==='synthetic'){
 for(const kind of kinds)for(const seed of seeds){const rows=generate(seed,kind,5400),candles=barsOf(rows);
  sources.push({kind,seed});for(const i of [1850,4700])evaluate(rows,candles,i,kind+':'+seed,kind);}
}else{
 for(const file of fs.readdirSync(directory).filter(f=>f.endsWith('.csv')).sort()){
  const rows=fs.readFileSync(path.join(directory,file),'utf8').trim().split(/\r?\n/).map(l=>{
   const f=l.split(','),raw=Number(f[0]),from=raw>1e15?raw/1000:raw;
   return {barFrom:from,ts:from+1000,open:Number(f[1]),high:Number(f[2]),low:Number(f[3]),price:Number(f[4])};});
  assert.ok(rows.length>=80000);assert.ok(rows.every((q,i)=>q.price>0&&Number.isFinite(q.ts)&&(!i||q.ts-rows[i-1].ts===1000)));
  const candles=barsOf(rows);sources.push({file,quotes:rows.length,firstCloseAt:rows[0].ts,lastCloseAt:rows.at(-1).ts});
  for(let i=3600;i+600<rows.length;i+=1800)evaluate(rows,candles,i,file,null);
 }
}
const groups=g=>Object.fromEntries(Object.entries(g).map(([k,b])=>[k,summary(b)]));
const report={source:directory==='synthetic'?'Independent synthetic streams; NOT broker performance':'Real Binance spot 1s OHLC archives; NOT IQ Option/Exnova',
 candidateModel:'contextual-candle-trajectory-v1',preservedVersion:'13.4.67.1',preservedCommit:'431bd6ffc276015a6581e0d6ba7a56c244de72e9',
 publishedVersion:'13.4.67.2',publishedCommit:'66c42ff6da4e7af7268a933b9ff83ddfe0b9be90',productionChanged:false,
 hypothesesFrozenBeforeEvaluation:true,chartCandleSeconds:PERIOD,chartPeriodIndependentOfExpiry:true,
 structure:'Exactly three closed bars: bodies, rejection wicks, high/low progression, acceleration and range expansion',
 currentQuoteRole:'Recent temporal movement, conditioned jointly on three mandatory closed OHLC bars; forming OHLC excluded',
 quoteAvailability:'Archive 1s OHLC closes become observable at barFrom+1000; aggregated bars at explicit end',
 scope:'Both now->expiry and scheduled entry->expiry, six horizons; no broker win-rate claim',
 drawPolicy:'Draws never count as wins; coverage is reported',independentSourceSpacingSeconds:1800,
 sources,totals:summary(totals),byMode:groups(byMode),byHorizon:groups(byHorizon),bySource:groups(bySource),bySyntheticKind:groups(byKind)};
 console.log('SENTINEL_CONTEXTUAL_CANDLE_RESULT='+JSON.stringify(report));
 if(output){fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');fs.writeFileSync(output.replace(/\.json$/,'.rows.jsonl'),decisions.map(v=>JSON.stringify(v)).join('\n')+'\n');}
