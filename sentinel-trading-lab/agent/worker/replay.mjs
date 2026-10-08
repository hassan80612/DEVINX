import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import {DemoTradingRuntime} from '../src/core/runtime.mjs';
import {analyzeMarket} from '../src/core/strategy.mjs';

export function analyzeReplayFrame(runtime,snap,now){
  const analysis=analyzeMarket({candles:snap.candles,quoteHistory:snap.quoteHistory,strategy:runtime.settings.strategy,minConfidence:runtime.settings.risk.minConfidence,durationMs:runtime.settings.orderDurationMs,forecastHorizonSeconds:runtime.settings.forecastHorizonSeconds,quoteTs:snap.quoteTs,now});
  if(!analysis.entryPlanner)return analysis;
  const panel=runtime._strategyPanel(snap,now);analysis.strategyCards=panel.cards;analysis.strategyConfluence=panel.confluence;analysis.generalConsensus=runtime._generalConsensus(analysis,panel);runtime._mergeScenarioConfluence(analysis,panel,snap,now);analysis.operationalSignal=runtime._operationalSignalState(analysis,snap,now);runtime.forecastResearch.observe({asset:runtime.settings.asset,analysis,snap,now});return analysis;
}
// Replays recorded quotes and checkpoints in arrival order. Never calls a broker.
export async function replayJournal(paths,{delays=[0,1000,2000],analyze=analyzeReplayFrame,includeSignalOutcomes=false}={}){
  const contexts=new Map(),pending=[],outcomes=[],states={},seen=new Set();let previousTs=0,events=0,analyses=0,expiredWithoutQuote=0;
  const score=(ctx,now)=>{
    for(const p of pending.filter(p=>p.key===ctx.key&&!p.done)){
      if(!p.entry&&now>=p.signalAt+p.delay){const q=ctx.quotes.find(q=>q.ts>=p.signalAt+p.delay);if(q&&q.ts<=p.entryDeadline&&q.ts-(p.signalAt+p.delay)<=1500){p.entry={...q};p.dueAt=q.ts+p.durationMs}else if(now>p.entryDeadline){p.done=true;outcomes.push({...p,filled:false,reason:'entry-window-ended'})}}
      if(p.entry&&now>=p.dueAt){const q=ctx.quotes.filter(q=>Math.abs(q.ts-p.dueAt)<=1500).sort((a,b)=>Math.abs(a.ts-p.dueAt)-Math.abs(b.ts-p.dueAt))[0];if(q){const delta=q.price-p.entry.price,draw=Math.abs(delta)<=Math.abs(p.entry.price)*1e-10;p.done=true;outcomes.push({...p,filled:true,settledAt:q.ts,settledPrice:q.price,won:draw?null:p.side==='CALL'?delta>0:delta<0})}else if(now-p.dueAt>15000){p.done=true;expiredWithoutQuote++}}
    }
  };
  for(const path of paths){
    const lines=createInterface({input:createReadStream(path),crlfDelay:Infinity});
    for await(const line of lines){
      if(!line.trim())continue;const e=JSON.parse(line);if(e.schema!==1)throw new Error('unsupported_journal_schema');
      if(e.type!=='market')continue;
      if(Number(e.ts)<previousTs)throw new Error('journal_not_chronological');previousTs=Number(e.ts);events++;
      const key=e.provider+'|'+e.asset;let ctx=contexts.get(key);
      if(!ctx){ctx={key,quotes:[],candles:[],runtime:new DemoTradingRuntime(),lastAnalysis:0};contexts.set(key,ctx)}
      const r=ctx.runtime;r.settings.asset=e.asset;Object.assign(r.settings,{...e.settings,demoAutopilot:false,mode:'real'});r.settings.risk.minConfidence=Number(e.settings?.minConfidence||74);
      if(e.candles)ctx.candles=e.candles.filter(c=>Number(c.from||0)*1000<=e.ts);
      for(const q of e.quotes||[]){if(Number(q.ts)>e.ts)throw new Error('future_quote_in_journal');if(Number(q.ts)>Number(ctx.quotes.at(-1)?.ts||0))ctx.quotes.push({ts:Number(q.ts),price:Number(q.price)})}
      ctx.quotes=ctx.quotes.slice(-9000);score(ctx,e.ts);
      if(e.ts-ctx.lastAnalysis<1000||ctx.candles.length<35)continue;
      ctx.lastAnalysis=e.ts;
      // Forming candle is updated only with quotes received by this frame.
      const candles=ctx.candles.map(c=>({...c})),last=candles.at(-1),visible=ctx.quotes.filter(q=>q.ts>=Number(last.from||0)*1000);
      if(visible.length){last.close=visible.at(-1).price;last.high=Math.max(Number(last.high),...visible.map(q=>q.price));last.low=Math.min(Number(last.low),...visible.map(q=>q.price))}
      const snap={candles,quoteHistory:ctx.quotes.filter(q=>e.ts-q.ts<=180000).slice(-900),quoteTs:Number(e.quoteTs),price:Number(e.quote),provider:e.provider,source:'RECORDED'};
      const a=analyze(r,snap,e.ts);analyses++;const op=a.operationalSignal||{};states[op.state||'NO_DATA']=(states[op.state||'NO_DATA']||0)+1;
      if(op.actionable){const id=key+'|'+op.createdAt+'|'+op.side;if(!seen.has(id)){seen.add(id);for(const delay of delays)pending.push({key,id,side:op.side,signalAt:e.ts,entryDeadline:op.activeUntil,durationMs:op.durationMs,delay,done:false});score(ctx,e.ts)}}
    }
  }
  const results=delays.map(delay=>{const rows=outcomes.filter(x=>x.delay===delay&&x.filled),wins=rows.filter(x=>x.won===true).length,losses=rows.filter(x=>x.won===false).length;return{delayMs:delay,samples:wins+losses,wins,losses,draws:rows.length-wins-losses,winRate:wins+losses?100*wins/(wins+losses):null,unfilled:outcomes.filter(x=>x.delay===delay&&!x.filled).length}});
  const signalOutcomes=includeSignalOutcomes?outcomes.map(x=>({key:x.key,side:x.side,signalAt:x.signalAt,
    entryAt:x.entry?.ts??null,entryPrice:x.entry?.price??null,settledAt:x.settledAt??null,
    settledPrice:x.settledPrice??null,delayMs:x.delay,filled:x.filled===true,
    won:x.won??null,reason:x.reason??null})):undefined;
  return{events,analyses,signals:seen.size,states,results,pending:pending.filter(x=>!x.done).length,expiredWithoutQuote,
    ...(includeSignalOutcomes?{signalOutcomes}:{}),
    research:[...contexts.values()].map(c=>({asset:c.runtime.settings.asset,...c.runtime.forecastResearch.summary()})),
    note:'Reprodução de sinais; sem ordens. Resultados dependem da qualidade e cobertura dos dados gravados.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const paths=process.argv.slice(2);if(!paths.length)throw new Error('Use: node worker/replay.mjs history-1.jsonl history-2.jsonl');console.log(JSON.stringify(await replayJournal(paths),null,2));
}
