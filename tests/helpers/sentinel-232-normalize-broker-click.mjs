// Restore the frozen 230 broker click source after subtracting exactly two
// reviewed 232 performance edits. All strict broker trading, expiry, stake,
// stop-loss and last-millisecond safety bytes remain audited.
const edits=[
  [
    "  // Same page + active instrument and a successful live DOM validation are\n  // authoritative. Expiring the cache every 15s forced a slow full-iframe\n  // rescan exactly when a fresh CALL/PUT signal needed its first click.\n  // On removed/recreated buttons the strict selector check below fails\n  // closed and triggers normal re-discovery.\n  if(cached&&cached.page===page&&cached.token===token){",
    "  if(cached&&cached.page===page&&cached.token===token&&Date.now()-cached.at<=15000){"
  ],
  [
    "  // A cache miss used to scan each broker iframe SEQUENTIALLY. On Exnova\n  // several slow iframes could exhaust the first-click freshness window.\n  // Inspect independently in parallel, then apply EXACTLY the prior\n  // uniqueness/error checks. No button is clicked during discovery.\n  const inspected=await Promise.all(page.frames().map(async f=>({\n   frame:f,value:await f.evaluate(inspectTradeControls,{marker:randomUUID()}).catch(()=>null)\n  })));\n  for(const {frame:f,value:v} of inspected){\n   if(v?.error)reason=v.error;\n   if(v?.callSelector){if(found)throw errorBefore('Mais de um painel de negociação aberto.');found=v;frame=f;}\n  }",
    "  for(const f of page.frames()){\n   let v;try{v=await f.evaluate(inspectTradeControls,{marker:randomUUID()});}catch{continue;}\n   if(v?.error)reason=v.error;\n   if(v?.callSelector){if(found)throw errorBefore('Mais de um painel de negociação aberto.');found=v;frame=f;}\n  }"
  ]
];
export function normalize232BrokerClick(text){
 let src=String(text);
 for(const [newPart,oldPart] of edits){
  if(src.split(newPart).length!==2)throw Error('unexpected 232 broker click source drift');
  src=src.replace(newPart,oldPart);
 }
 return src;
}
