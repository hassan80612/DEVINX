import {appendFile,mkdir,readdir,stat,unlink} from 'node:fs/promises';
import {join} from 'node:path';
// Price-only, bounded journal. No credentials, account balances or order commands.
export class MarketJournal{
  constructor({directory,maxBytes=256*1024*1024,segmentBytes=16*1024*1024,keepDays=7}={}){this.directory=directory;this.maxBytes=maxBytes;this.segmentBytes=segmentBytes;this.keepDays=keepDays;this.queue=[];this.pendingBytes=0;this.sequence=0;this.file=null;this.size=0;this.busy=null;this.last=new Map();this.error=null;this.dropped=0;this.lastCleanup=0;this.written=0}
  enqueue(event){const line=JSON.stringify({schema:1,...event})+'\n';if(this.pendingBytes+Buffer.byteLength(line)>4*1024*1024){this.dropped++;return}this.queue.push(line);this.pendingBytes+=Buffer.byteLength(line)}
  market(m,settings,now=Date.now()){
    const asset=String(m.validatedSymbol||m.symbol||'').toUpperCase();if(!asset||m.feedValidated===false||!Number.isFinite(Number(m.quote)))return;
    const key=m.provider+'|'+asset,prior=this.last.get(key),quotes=(m.quoteHistory||[]).filter(q=>Number(q.ts)>(prior?.quoteTs||0)&&Number(q.ts)<=now).map(q=>({ts:Number(q.ts),price:Number(q.price)}));
    if(!quotes.length&&Number(m.quoteTs||m.lastQuoteAt||0)<=(prior?.quoteTs||0))return;
    const quoteTs=Number(m.quoteTs||m.lastQuoteAt||quotes.at(-1)?.ts||now);
    if(!quotes.length)quotes.push({ts:quoteTs,price:Number(m.quote)});
    const candleKey=Number(m.candles?.at(-1)?.from||0),checkpoint=!prior||candleKey!==prior.candleKey||now-prior.checkpointAt>60000;
    this.enqueue({type:'market',ts:now,provider:m.provider,asset,quote:Number(m.quote),quoteTs,quotes,candles:checkpoint?m.candles:undefined,volumeKind:'unverified',settings:{strategy:settings.strategy,strategy2:settings.strategy2,strategy3:settings.strategy3,orderDurationMs:settings.orderDurationMs,forecastHorizonSeconds:settings.forecastHorizonSeconds,futureDisplayThreshold:settings.futureDisplayThreshold,minConfidence:settings.risk?.minConfidence}});
    this.last.set(key,{quoteTs,candleKey,checkpointAt:checkpoint?now:prior.checkpointAt});
  }
  analysis(analysis,asset,now){if(!analysis)return;this.enqueue({type:'analysis',ts:now,asset,operational:analysis.operationalSignal,horizons:Object.fromEntries(Object.entries(analysis.entryPlanner?.horizons||{}).map(([k,p])=>[k,{side:p.rawBias,call:p.callProbability,put:p.putProbability,confidence:p.confidence,directionReady:p.directionReady,scenario:p.scenario,safety:p.safety,features:p.evidenceFamilies,validation:p.validation,research:p.research}]))})}
  async flush(){if(this.busy)return this.busy;this.busy=this._flush().catch(e=>{this.error=String(e.message)}).finally(()=>{this.busy=null});return this.busy}
  async _flush(){
    if(!this.queue.length)return;
    await mkdir(this.directory,{recursive:true});
    const day=new Date().toISOString().slice(0,10);
    if(!this.file||this.size>=this.segmentBytes||!this.file.includes(day)){this.file=join(this.directory,`${day}-${Date.now()}-${this.sequence++}.jsonl`);this.size=0}
    const lines=this.queue.splice(0),bytes=lines.join('');this.pendingBytes=0;
    try{await appendFile(this.file,bytes,{mode:0o600})}catch(error){if(this.pendingBytes+Buffer.byteLength(bytes)<=4*1024*1024){this.queue.unshift(...lines);this.pendingBytes+=Buffer.byteLength(bytes)}else this.dropped+=lines.length;throw error}this.size+=Buffer.byteLength(bytes);this.written+=lines.length;this.error=null;
    if(Date.now()-this.lastCleanup>60000){this.lastCleanup=Date.now();await this.cleanup()}
  }
  async cleanup(){
    const files=[];for(const name of await readdir(this.directory)){if(!/^\d{4}-\d{2}-\d{2}-\d+-\d+\.jsonl$/.test(name))continue;const path=join(this.directory,name),s=await stat(path);files.push({path,size:s.size,mtime:s.mtimeMs})}
    files.sort((a,b)=>a.mtime-b.mtime);let total=files.reduce((v,f)=>v+f.size,0);
    for(const f of files)if(f.path!==this.file&&(total>this.maxBytes||Date.now()-f.mtime>this.keepDays*86400000)){await unlink(f.path);total-=f.size}
  }
  status(){return{enabled:true,eventsWritten:this.written,pending:this.queue.length,dropped:this.dropped,error:this.error,retentionDays:this.keepDays,maxBytes:this.maxBytes}}
}
