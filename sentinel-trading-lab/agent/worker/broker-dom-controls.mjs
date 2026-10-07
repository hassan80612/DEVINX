// Read browser-owned DOM, including closed component roots. Never sends input or orders.
export async function readBrokerDomControls(cdp){
  const {root}=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
  const entries=[];
  const textCache=new WeakMap();
  const text=node=>{if(!node)return'';if(textCache.has(node))return textCache.get(node);const value=String(node.nodeValue||'')+(node.children||[]).map(text).join(' ');textCache.set(node,value);return value};
  function walk(node,parents=[],excluded=false){
    if(!node)return;
    const attrs={};for(let i=0;i<(node.attributes||[]).length;i+=2)attrs[node.attributes[i]]=node.attributes[i+1];
    const skip=excluded||attrs.id==='sentinel-trading-overlay-host';
    const entry={node,attrs,parents,label:text(node).trim().slice(0,240)};
    if(!skip&&node.nodeType===1&&node.backendNodeId)entries.push(entry);
    for(const child of [...(node.children||[]),...(node.shadowRoots||[]),...(node.contentDocument?[node.contentDocument]:[])])walk(child,[entry,...parents].slice(0,5),skip);
  }
  walk(root);
  const desc=e=>[e.label,...Object.values(e.attrs)].join(' ').toLowerCase();
  const amountRx=/\b(invest|investment|investimento|amount|valor|stake|aposta)\b/i;
  const direction=e=>{
    const own=desc(e),tag=e.node.nodeName,button=tag==='BUTTON'||e.attrs.role==='button'||/deal[-_]?button|trade[-_]?button|btn[-_]?(up|down|call|put)/.test(own);
    if(!button)return null;
    const up=/\b(acima|higher|buy|comprar|compra|call|up)\b/.test(own),down=/\b(abaixo|lower|sell|vender|venda|put|down)\b/.test(own);
    if(up===down)return null;
    return{side:up?'buy':'sell',score:(tag==='BUTTON'||e.attrs.role==='button'?20:10)+(e.label.length<80?5:0)};
  };
  const ranked=kind=>entries.map(e=>{const d=direction(e);return{e,score:d?.side===kind?d.score:0}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,12);
  const editable=e=>e.node.nodeName==='INPUT'||e.attrs.role==='spinbutton'||e.attrs.contenteditable==='true';
  // Some broker components expose a clickable numeric value, opening the real
  // editor on click. Scope it to the investment panel, never balance or expiry.
  const amountContext=e=>amountRx.test(desc(e))||e.parents.slice(0,4).some(p=>p.label.length<160&&amountRx.test(p.label)&&!/(expiration|expiry|expiraç|vencimento|saldo|balance|payout|profit|lucro|\bcall\b|\bput\b|acima|abaixo|higher|lower)/i.test(p.label));
  const numberText=e=>/^\s*(?:(?:R?\$|US\$|USD|BRL|€)\s*)?\d[\d.,\s]*(?:\s*(?:USD|BRL))?\s*$/.test(e.label);
  const amounts=entries.filter(e=>!(/password|email|hidden/.test(e.attrs.type||''))&&amountContext(e)&&(editable(e)||numberText(e)))
    .map(e=>({e,score:(editable(e)?40:10)+(amountRx.test(desc(e))?20:0)})).sort((a,b)=>b.score-a.score).slice(0,16);
  const inspect=async entry=>{
    let objectId=null;
    try{
      const r=await cdp.send('DOM.resolveNode',{backendNodeId:entry.node.backendNodeId});objectId=r.object?.objectId;if(!objectId)return null;
      const result=await cdp.send('Runtime.callFunctionOn',{objectId,returnByValue:true,functionDeclaration:`function(){const r=this.getBoundingClientRect(),s=getComputedStyle(this);return{visible:s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0&&r.width>8&&r.height>8&&!this.disabled,value:String(this.value||this.getAttribute('aria-valuenow')||this.textContent||'').trim(),editable:!this.readOnly&&(this.tagName==='INPUT'||this.isContentEditable||this.getAttribute('role')==='spinbutton'),clickable:s.cursor==='pointer'||this.tabIndex>=0||this.getAttribute('role')==='button'||!!this.onclick||/input|edit|amount|invest/i.test(this.className||'')}}`});
      return result.result?.value?.visible?{...entry,value:result.result.value.value,editable:result.result.value.editable,clickable:result.result.value.clickable}:null;
    }catch{return null}finally{if(objectId)await cdp.send('Runtime.releaseObject',{objectId}).catch(()=>{})}
  };
  const first=async(list,predicate=()=>true)=>{for(const {e} of list){const found=await inspect(e);if(found&&predicate(found))return found}return null};
  const buy=await first(ranked('buy')),sell=await first(ranked('sell')),amount=await first(amounts,x=>x.editable||x.clickable);
  const expiries=entries.filter(e=>/expiration|expiry|expiraç|expiracao|vencimento|duration/.test(desc(e))).slice(0,20);
  let expiry=null;
  for(const e of expiries){const x=await inspect(e);if(!x)continue;const m=x.value.toLowerCase().match(/^\s*(\d+(?:[.,]\d+)?)\s*(s|seg|segundos?|min|minutos?)\s*$/);if(m){const ms=Number(m[1].replace(',','.'))*(m[2].startsWith('min')?60000:1000);if(ms>=10000&&ms<=3600000){expiry={ms,raw:x.value};break}}}
  const same=buy&&sell&&buy.node.backendNodeId===sell.node.backendNodeId;
  return{buy:!!buy&&!same,sell:!!sell&&!same,amount:!!amount,amountEditable:!!amount?.editable,amountValue:amount?.value||'',buyText:buy?desc(buy).slice(0,180):'',sellText:sell?desc(sell).slice(0,180):'',amountText:amount?desc(amount).slice(0,180):'',source:'browser-dom',expirationDurationMs:expiry?.ms??null,expirationRaw:expiry?.raw||'',expirationKind:expiry?'duration':null,expirationConfidence:expiry?90:0,ax:{buyBackendId:buy?.node.backendNodeId||null,sellBackendId:sell?.node.backendNodeId||null,amountBackendId:amount?.node.backendNodeId||null}};
}
