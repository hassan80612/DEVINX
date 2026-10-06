import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseBrokerExpiry} from '../src/core/expiry-parser.mjs';

const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function visibleSymbol(text){
  const t=String(text||'').trim().toUpperCase();
  if(/^(GOLD|OURO)(?:\s|$)/.test(t))return 'XAU/USD'+(/\bOTC\b/.test(t)?' OTC':'');
  if(/^(SILVER|PRATA)(?:\s|$)/.test(t))return 'XAG/USD'+(/\bOTC\b/.test(t)?' OTC':'');
  const m=t.match(/^([A-Z]{3})\s*[/\-]?\s*([A-Z]{3})(?:\s*\(?OTC\)?)?(?:\s|$)/);
  const codes=new Set(['USD','EUR','GBP','JPY','AUD','NZD','CAD','CHF','BRL','TRY','ZAR','MXN','SGD','HKD','NOK','SEK','DKK','PLN','THB','BTC','ETH','XAU','XAG']);
  return m&&codes.has(m[1])&&codes.has(m[2])?`${m[1]}/${m[2]}${/\bOTC\b/.test(t)?' OTC':''}`:null;
}

// Only the chart heading below the tabs and the labelled trade-expiry field count.
// Names in background tabs, chart intervals and the Sentinel panel never count.
export function parseVisibleBrokerView({width,height,lines=[],selectedSymbols=[]},now=Date.now()){
  const w=Number(width),h=Number(height);if(!(w>300&&h>200))return{symbol:null,expiry:null,ambiguous:false};
  const header=lines.filter(l=>l.x>=0&&l.x<w*.40&&l.y>=35&&l.y<Math.min(210,h*.32));
  const visual=[...new Set(header.map(l=>visibleSymbol(l.text)).filter(Boolean))];
  const selected=[...new Set(selectedSymbols.filter(Boolean))];
  const candidates=selected.length?selected:visual;
  const symbol=candidates.length===1?candidates[0]:null;
  const fields=[];
  for(const label of lines.filter(l=>l.x>w*.62&&/expir|vencimento|duration|duracao|trade time/.test(normalize(l.text)))){
    const near=lines.filter(l=>l.x>w*.62&&Math.abs(l.x-label.x)<w*.16&&l.y>=label.y-5&&l.y-label.y<90);
    const labelValue=parseBrokerExpiry(label.text,'expiration',now);
    if(labelValue)fields.push({...labelValue,raw:label.text,score:50});
    for(const value of near){
      const parsed=parseBrokerExpiry(value.text,'expiration',now);
      if(parsed)fields.push({...parsed,raw:value.text,score:50});
    }
  }
  const unique=new Map(fields.map(f=>[`${f.kind}:${f.ms}`,f]));
  return{symbol,ambiguous:candidates.length>1,expiry:unique.size===1?[...unique.values()][0]:null};
}

export class WindowsBrokerOcr{
  constructor({dataDir}){this.dataDir=dataDir;this.child=null;this.pending=null;this.sequence=0;this.lastError=null;this.retryAt=0;}
  start(){
    if(this.child)return;
    const script=fileURLToPath(new URL('./broker-ocr.ps1',import.meta.url));
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{windowsHide:true,stdio:['pipe','pipe','ignore']});
    this.child=child;
    const fail=reason=>{if(this.child===child)this.child=null;this.lastError=reason;this.retryAt=Date.now()+30000;const pending=this.pending;this.pending=null;if(pending)clearTimeout(pending.timer);pending?.reject(new Error(reason));};
    child.on('error',()=>fail('windows_ocr_unavailable'));child.on('exit',()=>fail('windows_ocr_stopped'));
    createInterface({input:child.stdout}).on('line',line=>{try{const r=JSON.parse(line);if(this.pending&&r.id===this.pending.id){const p=this.pending;this.pending=null;clearTimeout(p.timer);if(r.error){this.lastError=r.error;p.reject(new Error(r.error))}else{this.lastError=null;p.resolve(r)}}}catch{}});
  }
  async recognize(png){
    if(process.platform!=='win32'||Date.now()<this.retryAt)return null;
    if(this.pending)throw new Error('ocr_busy');
    await mkdir(this.dataDir,{recursive:true});
    const id=++this.sequence,path=join(this.dataDir,`broker-view-${process.pid}-${id}.png`);
    await writeFile(path,png);
    try{
      this.start();
      return await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{this.pending=null;this.lastError='windows_ocr_timeout';this.retryAt=Date.now()+30000;this.child?.kill();this.child=null;reject(new Error(this.lastError))},6000);
        this.pending={id,resolve,reject,timer};
        this.child.stdin.write(JSON.stringify({id,path})+'\n',err=>{if(err&&this.pending?.id===id){clearTimeout(timer);this.pending=null;reject(err)}});
      });
    }finally{await rm(path,{force:true}).catch(()=>{})}
  }
  close(){const p=this.pending;this.pending=null;if(p){clearTimeout(p.timer);p.reject(new Error('ocr_closed'))}this.child?.kill();this.child=null;}
}

export class BrokerViewReader{
  constructor({dataDir}){this.ocr=new WindowsBrokerOcr({dataDir});this.page=null;this.cdp=null;this.last=null;this.at=0;this.pending=null;}
  async read(page){
    if(this.pending)return this.pending;
    if(page===this.page&&Date.now()-this.at<750)return this.last;
    this.pending=this.capture(page).finally(()=>{this.pending=null});return this.pending;
  }
  async capture(page){
    const start=Date.now();let model={width:0,height:0,lines:[],selectedSymbols:[]},source='cdp',closedRoots=0,hasCanvas=false;
    try{
      if(this.page!==page){await this.cdp?.detach().catch(()=>{});this.page=page;this.cdp=await page.context().newCDPSession(page)}
      const snap=await this.cdp.send('DOMSnapshot.captureSnapshot',{computedStyles:['display','visibility','opacity']});
      const strings=snap.strings;
      const size=await page.evaluate(()=>({width:innerWidth,height:innerHeight,canvas:[...document.querySelectorAll('canvas')].some(c=>c.width>500&&c.height>250)}));hasCanvas=size.canvas;model={...size,lines:[],selectedSymbols:[]};
      for(const doc of snap.documents.slice(0,24)){
        const nodes=doc.nodes,layout=doc.layout,attrs=nodes.attributes.map(a=>Object.fromEntries(Array.from({length:a.length/2},(_,i)=>[strings[a[i*2]],strings[a[i*2+1]]])));
        closedRoots+=(nodes.shadowRootType?.value||[]).filter(i=>strings[i]==='closed').length;
        const excluded=new Set();
        for(let i=0;i<nodes.nodeName.length;i++){if(/sentinel-trading-overlay/.test(attrs[i]?.id||'')||excluded.has(nodes.parentIndex[i]))excluded.add(i);}
        for(let j=0;j<layout.nodeIndex.length;j++){
          const i=layout.nodeIndex[j],box=layout.bounds[j],styles=(layout.styles[j]||[]).map(k=>strings[k]),text=String(strings[layout.text[j]]||'').trim();
          if(excluded.has(i)||!text||text.length>140||box[2]<=0||box[3]<=0||styles[0]==='none'||styles[1]==='hidden'||styles[2]==='0')continue;
          model.lines.push({text,x:box[0],y:box[1],width:box[2],height:box[3]});
          const symbol=visibleSymbol(text);if(!symbol)continue;
          for(let parent=nodes.parentIndex[i],n=0;parent>=0&&n++<5;parent=nodes.parentIndex[parent]){
            const a=attrs[parent]||{},selected=a['aria-selected']==='true'||a['aria-current']==='true'||/^(active|selected|current)$/.test(a['data-state']||'')||/(^|[ _-])(active|selected|current)([ _-]|$)/i.test(a.class||'');
            if(selected){model.selectedSymbols.push(symbol);break;}
          }
        }
      }
    }catch{}
    let parsed=parseVisibleBrokerView(model);
    if((!parsed.symbol||!parsed.expiry)&&process.platform==='win32'&&hasCanvas){
      try{
        // Read the broker's canvas itself, so a movable Sentinel card cannot cover it.
        // Screenshot fallback is used only if the canvas has no readable pixels.
        const encoded=await page.evaluate(async()=>{
          const canvas=[...document.querySelectorAll('canvas')].filter(c=>c.width>500&&c.height>250).sort((a,b)=>b.width*b.height-a.width*a.height)[0];
          if(!canvas)return null;
          const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);
          const sample=ctx.getImageData(Math.floor(copy.width*.15),Math.floor(copy.height*.10),1,1).data;
          if(sample[3]===0||sample[0]+sample[1]+sample[2]===0){
            if(typeof ImageCapture!=='function'||!canvas.captureStream)return null;
            const stream=canvas.captureStream(10),track=stream.getVideoTracks()[0];let timer,frame;
            try{frame=await Promise.race([new ImageCapture(track).grabFrame(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('canvas_frame_timeout')),650)})]);ctx.drawImage(frame,0,0,copy.width,copy.height)}finally{clearTimeout(timer);frame?.close();track?.stop();}
          }
          const rect=canvas.getBoundingClientRect();return{base64:copy.toDataURL('image/png').split(',')[1],width:rect.width,height:rect.height};
        }).catch(()=>null);
        const png=encoded?Buffer.from(encoded.base64,'base64'):await page.screenshot({type:'png',scale:'css',timeout:3000,mask:[page.locator('#sentinel-trading-overlay')],maskColor:'#000000'});
        const ocr=await this.ocr.recognize(png);
        if(ocr){if(encoded&&encoded.width>0&&encoded.height>0){const sx=encoded.width/ocr.width,sy=encoded.height/ocr.height;ocr.lines=ocr.lines.map(l=>({...l,x:l.x*sx,y:l.y*sy,width:l.width*sx,height:l.height*sy}));ocr.width=encoded.width;ocr.height=encoded.height;}const native=parseVisibleBrokerView(ocr);parsed={symbol:parsed.symbol||native.symbol,ambiguous:parsed.ambiguous||native.ambiguous,expiry:parsed.expiry||native.expiry};source=encoded?'canvas-ocr':'screen-ocr';}
      }catch(e){source='unreadable';this.ocr.lastError=String(e?.message||e)}
    }
    this.at=Date.now();this.last={...parsed,source,at:this.at,scanMs:Date.now()-start,closedRoots,textCount:model.lines.length,error:this.ocr.lastError};return this.last;
  }
}
