import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {MarketJournal} from './market-journal.mjs';

/**
 * Price-only DEMO collection. Installed ONLY with the explicit research build
 * and only after the user elects to run that installer locally.
 * No account balances, sessions, trades, holdings, predictions or personal data.
 * No network/database writes. Fail closed on UNKNOWN/REAL or stale quotes.
 */
export function eligibleDemoQuote({provider,market,adapterMode,now=Date.now()}={}){
  const mode=String(market?.mode||'').toLowerCase();
  const confirmedMode=String(adapterMode||'').toLowerCase();
  const symbol=String(market?.validatedSymbol||'').trim().toUpperCase();
  const observedSymbol=String(market?.symbol||'').trim().toUpperCase();
  const quoteTs=Number(market?.lastQuoteAt||0);
  const price=Number(market?.quote);
  const validProvider=['iq_option','exnova'].includes(String(provider||''));
  const activeMarket=String(market?.marketStatus||'').toLowerCase();
  const safeStatus=!['switching','stale','disconnected','error','loading'].includes(activeMarket);
  if(!validProvider||mode!=='demo'||confirmedMode!=='demo'||!symbol||
    observedSymbol && symbol!==observedSymbol||
    market?.feedValidated!==true||
    market?.assetValidated===false||
    !safeStatus||
    !(quoteTs>0)||!Number.isFinite(price)||price<=0||
    quoteTs>now||now-quoteTs>2400) return null;
  return Object.freeze({provider,asset:symbol,ts:quoteTs,price});
}
export class DemoQuoteRecorder{
  constructor({directory,release,stopFlag=resolve(directory,'..','demo-quotes-disabled.flag'),
    clock=()=>Date.now()}={}){
    if(!directory)throw Error('demo_quote_directory_required');
    this.clock=clock;
    this.stopFlag=stopFlag;
    this.journal=new MarketJournal({
      directory,maxBytes:64*1024*1024,segmentBytes:4*1024*1024,
      keepDays:7,release:{version:String(release?.version||'unknown'),
        build:String(release?.build||'unknown')}
    });
    this.last=new Map();
    this.lastAccountMode='unknown';
    this.skipped={notDemo:0,unverified:0,duplicate:0,disabled:0};
  }
  get enabled(){return !existsSync(this.stopFlag)}
  observe({provider,market,adapterMode,now=this.clock()}={}){
    this.lastAccountMode=String(market?.mode||'unknown').toLowerCase();
    if(!this.enabled){this.skipped.disabled++;return false}
    const quote=eligibleDemoQuote({provider,market,adapterMode,now});
    if(!quote){
      if(this.lastAccountMode==='real'||this.lastAccountMode==='unknown')this.skipped.notDemo++;
      else this.skipped.unverified++;
      return false
    }
    const key=quote.provider+'|'+quote.asset;
    if(Number(this.last.get(key)||0)>=quote.ts){this.skipped.duplicate++;return false}
    this.last.set(key,quote.ts);
    this.journal.enqueue({
      type:'market',ts:now,provider:quote.provider,asset:quote.asset,
      quote:quote.price,quoteTs:quote.ts,
      quotes:[{ts:quote.ts,price:quote.price}]
    });
    return true
  }
  flush(){return this.journal.flush()}
  status(){
    return {
      enabled:this.enabled,scope:'DEMO_ONLY',accountMode:this.lastAccountMode,
      recording:this.enabled&&this.lastAccountMode==='demo',
      localOnly:true,directory:'worker/data/market-history',
      ...this.journal.status(),enabled:this.enabled,
      writtenEvents:this.journal.written,skipped:{...this.skipped}
    };
  }
}
