// Canvas controls have no HTML buttons. These are user-selected CSS points,
// relative to one identified canvas, never guessed screen coordinates.
export function normalizeCanvasBinding(value){
 if(value?.format!=='sentinel-canvas-targets-v1')throw Error('Mapeamento CALL/PUT inválido.');
 const {origin,path,canvas,targets}=value;
 if(typeof origin!=='string'||!/^https?:\/\//.test(origin)||origin.length>300||typeof path!=='string'||path.length>500||!canvas||!targets)throw Error('Mapeamento CALL/PUT inválido.');
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 for(const k of ['width','height','viewportWidth','viewportHeight','pixelRatio'])if(!finite(canvas[k])||canvas[k]<=0||canvas[k]>50000)throw Error('Dimensões do mapeamento inválidas.');
 if(typeof canvas.domPath!=='string'||canvas.domPath.length>2000||typeof canvas.id!=='string'||canvas.id.length>300)throw Error('Painel do mapeamento inválido.');
 for(const side of ['CALL','PUT']){const p=targets[side];if(!p||!finite(p.x)||!finite(p.y)||p.x<0||p.y<0||p.x>=canvas.width||p.y>=canvas.height)throw Error('Ponto CALL/PUT inválido.');}
 if(Math.hypot(targets.CALL.x-targets.PUT.x,targets.CALL.y-targets.PUT.y)<12)throw Error('Indique CALL e PUT em pontos diferentes.');
 return{format:value.format,origin,path,canvas:{id:canvas.id,domPath:canvas.domPath,width:canvas.width,height:canvas.height,viewportWidth:canvas.viewportWidth,viewportHeight:canvas.viewportHeight,pixelRatio:canvas.pixelRatio},targets:{CALL:{...targets.CALL},PUT:{...targets.PUT}}};
}

// Self-contained because Playwright serializes this function into the page.
export function canvasControlBridge({action,binding,marker,label='Corretora'}){
 if(action==='passthrough-on'||action==='passthrough-off'){
  const host=document.getElementById('sentinel-trading-overlay-host');
  if(host?.shadowRoot){
   let style=host.shadowRoot.querySelector('[data-sentinel-pass-through-style]');
   if(!style){style=document.createElement('style');style.dataset.sentinelPassThroughStyle='1';style.textContent=':host([data-sentinel-pass-through]),:host([data-sentinel-pass-through]) *{pointer-events:none!important}';host.shadowRoot.append(style);}
   host.toggleAttribute('data-sentinel-pass-through',action==='passthrough-on');
  }
  return{ok:true};
 }
 const domPath=element=>{
  const parts=[];for(let e=element;e&&e.nodeType===1;e=e.parentElement){const siblings=e.parentElement?[...e.parentElement.children].filter(s=>s.tagName===e.tagName):[e];parts.unshift(e.tagName.toLowerCase()+':'+(siblings.indexOf(e)+1));}return parts.join('/');
 };
 const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
 const describe=e=>{const r=e.getBoundingClientRect();return{id:e.id||'',domPath:domPath(e),width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight,pixelRatio:devicePixelRatio};};
 if(action==='resolve'){
  const fail=message=>({error:message});
  if(document.getElementById('__sentinel-map-shield'))return fail('Conclua ou cancele o mapeamento CALL/PUT.');
  if(location.origin!==binding.origin||location.pathname!==binding.path)return fail('Página mudou. Use Mapear CALL/PUT nesta corretora.');
  const all=[...document.querySelectorAll('canvas')],matches=all.filter(e=>domPath(e)===binding.canvas.domPath&&e.id===binding.canvas.id&&visible(e));
  if(matches.length!==1)return fail('Painel gráfico mudou. Use Mapear CALL/PUT novamente.');
  const canvas=matches[0],actual=describe(canvas),saved=binding.canvas;
  if(['width','height','viewportWidth','viewportHeight','pixelRatio'].some(k=>Math.abs(actual[k]-saved[k])>0.5))return fail('Tamanho ou zoom mudou. Use Mapear CALL/PUT novamente.');
  canvas.setAttribute('data-sentinel-execution-canvas',marker);
  return{canvasSelector:'[data-sentinel-execution-canvas="'+marker+'"]',positions:binding.targets};
 }
 if(action!=='calibrate')return{error:'Ação de mapeamento inválida.'};
 if(document.getElementById('__sentinel-map-shield'))return{error:'Mapeamento já iniciado. Selecione CALL e depois PUT, ou pressione Esc.'};
 const host=document.getElementById('sentinel-trading-overlay-host'),oldVisibility=host?.style.visibility;
 if(host)host.style.visibility='hidden';
 const shield=document.createElement('div');shield.id='__sentinel-map-shield';
 Object.assign(shield.style,{position:'fixed',inset:'0',zIndex:'2147483647',background:'rgba(0,0,0,.06)',cursor:'crosshair',touchAction:'none'});
 const tip=document.createElement('div');Object.assign(tip.style,{position:'fixed',top:'12px',left:'12px',maxWidth:'min(550px,80vw)',background:'#102d32',color:'#fff',border:'2px solid #d5b66b',borderRadius:'10px',padding:'12px',font:'bold 16px Arial',pointerEvents:'none'});
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancelar / Esc';Object.assign(cancel.style,{position:'fixed',bottom:'12px',left:'12px',padding:'10px',background:'#50282e',color:'#fff',border:'1px solid #fff',cursor:'pointer'});
 shield.append(tip,cancel);document.documentElement.append(shield);
 let canvas=null,result=null,finished=false;
 const text=message=>{tip.textContent=label+' · '+message;};
 text('Indique o centro de CALL / ACIMA. Este clique NÃO envia operação. Depois indique PUT / ABAIXO.');
 const cleanup=()=>{shield.remove();document.removeEventListener('keydown',key,true);if(host)host.style.visibility=oldVisibility||'';};
 const key=event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();cleanup();}};
 document.addEventListener('keydown',key,true);
 const block=event=>{event.preventDefault();event.stopImmediatePropagation();};
 for(const name of ['mousedown','mouseup','pointerup','touchstart','touchend','contextmenu'])shield.addEventListener(name,block,true);
 shield.addEventListener('pointerdown',event=>{
  block(event);if(event.target===cancel)return;
  if(event.button!==0)return;
  const stack=document.elementsFromPoint(event.clientX,event.clientY),top=stack.find(e=>!shield.contains(e)&&e!==shield);
  const candidate=top?.closest?.('canvas');
  if(!candidate||!visible(candidate)){text('Indique o botão desenhado no painel gráfico da corretora, ou Esc para cancelar.');return;}
  if(canvas&&candidate!==canvas){text('CALL e PUT devem pertencer ao mesmo painel gráfico. Pressione Esc para recomeçar.');return;}
  const r=candidate.getBoundingClientRect(),point={x:event.clientX-r.left,y:event.clientY-r.top};
  if(!canvas){canvas=candidate;result={format:'sentinel-canvas-targets-v1',origin:location.origin,path:location.pathname,canvas:describe(canvas),targets:{CALL:point}};text('Agora indique o centro de PUT / ABAIXO. Este clique NÃO envia operação.');return;}
  if(Math.hypot(point.x-result.targets.CALL.x,point.y-result.targets.CALL.y)<12){text('PUT precisa ser um ponto diferente de CALL. Indique o centro de PUT / ABAIXO.');return;}
  const current=describe(canvas);if(['width','height','viewportWidth','viewportHeight','pixelRatio'].some(k=>Math.abs(current[k]-result.canvas[k])>0.5)){text('O tamanho mudou durante o mapeamento. Pressione Esc e recomece.');return;}
  result.targets.PUT=point;finished=true;
 },true);
 shield.addEventListener('click',async event=>{
  block(event);if(event.target===cancel){cleanup();return;}
  if(!finished)return;
  // Keep the shield through pointerup AND click, so neither selection reaches
  // the native canvas. Saving only happens after both selection clicks end.
  cleanup();
  try{await window.__sentinelOverlayAction({action:'executor-map-save',binding:result});}
  catch(error){const target=host?.shadowRoot?.querySelector('[data-sentinel-executor-action-msg]');if(target)target.textContent='Erro: '+String(error?.message||error);}
 },true);
 return{ready:true};
}
