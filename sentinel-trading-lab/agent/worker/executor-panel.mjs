const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const words={
 pt:['Bot automático','Valor por clique (igual à corretora)','Intervalo entre entradas','Parar em (min)','Stop loss','Saldo inicial manual','Ligar bot','Parar bot','0 = sem limite','Resultado da sessão','Ajuste na corretora o mesmo valor por entrada e a mesma duração do analista. O bot apenas clica CALL/PUT; valor e payout aqui são usados no resultado estimado. O bot segue cada novo CALL/PUT do analista.','Payout (%)','Saldo calculado','Disponível','Entrada','Saída','por cotação','corretora'],
 en:['Automatic bot','Amount per click (match broker)','Entry interval','Stop after (min)','Stop loss','Manual initial balance','Start bot','Stop bot','0 = no limit','Session result','Set the broker stake to the amount entered here and the duration to match the analyst. The bot only clicks CALL/PUT; amount and payout here are used for estimated results. The bot follows each new analyst CALL/PUT.','Payout (%)','Calculated balance','Available','Entry','Exit','quote estimate','broker'],
 es:['Bot automático','Importe por clic (igual a la plataforma)','Intervalo de entradas','Parar en (min)','Stop loss','Saldo inicial manual','Iniciar bot','Parar bot','0 = sin límite','Resultado de sesión','Configure en la plataforma el mismo importe indicado aquí y la duración del analista. El bot solo pulsa CALL/PUT; el importe y payout aquí se usan para estimar resultados. El bot sigue cada nueva señal CALL/PUT del analista.','Payout (%)','Saldo calculado','Disponible','Entrada','Salida','por cotización','plataforma'],
 fr:['Bot automatique','Montant par clic (identique au courtier)','Intervalle des entrées','Arrêt après (min)','Stop loss','Solde initial','Démarrer','Arrêter','0 = sans limite','Résultat de séance','Réglez chez le courtier le montant indiqué ici et la durée de l’analyste. Le bot clique seulement sur CALL/PUT ; montant et rendement servent aux résultats estimés. L’intervalle saute seulement des signaux.','Payout (%)','Solde calculé','Disponible','Entrée','Sortie','estimation par cours','courtier'],
 ar:['التداول الآلي','قيمة النقرة (نفس المنصة)','الفاصل بين الدخول','التوقف بعد (دقيقة)','حد الخسارة','الرصيد الأولي','تشغيل','إيقاف','0 = بدون حد','نتيجة الجلسة','اضبط قيمة النقرة (نفس المنصة) في المنصة لتطابق القيمة هنا والمدة لتطابق المحلل. الروبوت يضغط CALL/PUT فقط؛ القيمة والعائد هنا لتقدير النتائج. الروبوت يتبع كل إشارة CALL/PUT جديدة من المحلل.','العائد (%)','الرصيد المحسوب','المتاح','الدخول','الخروج','تقدير حسب السعر','المنصة']
};
// Shared controls stay next to the analyst controls, outside collapsed settings.
export function executorActions(state,language='pt'){
 if(!state)return '';const w=words[language]||words.pt;
 const mapLabel={pt:'Mapear',en:'Map controls',es:'Mapear',fr:'Repérer',ar:'تحديد'}[language]||'Mapear';
 return '<div data-sentinel-bot-actions style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:0">'+
 '<button data-sentinel-executor-action="start"'+(state.enabled||state.arming?' disabled':'')+' style="min-width:0;width:100%;height:33px;min-height:33px;border:1px solid #65c9a5;border-radius:9px;background:#174c40;color:#d8fff0;font:750 11px inherit;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+w[6]+'</button>'+
 '<button data-sentinel-executor-action="stop" style="min-width:0;width:100%;height:33px;min-height:33px;border:1px solid #c07983;border-radius:9px;background:#4b2932;color:#ffe5e9;font:750 11px inherit;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+w[7]+'</button>'+
 '<button data-sentinel-executor-action="map"'+(state.enabled||state.arming||state.pending||state.executing?' disabled':'')+' style="min-width:0;width:100%;height:33px;min-height:33px;border:1px solid #657977;border-radius:9px;background:transparent;color:inherit;font:750 11px inherit;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+mapLabel+'</button></div>';
}
function executorPanelParts(state,language='pt',options={}){
 if(!state)return '';const w=words[language]||words.pt,c=state.config||{};
 const dict={
 pt:['Configurações do bot','Modo','Automático','Somente CALL','Somente PUT','Stop Loss · saldo mínimo','Stop Win · saldo-alvo','Martingale','Níveis','Multiplicador','Limite de sequências perdedoras','Mapear controles','Desligado','Analisando','Operando','Ativando','Stops aguardam saldo','Stops ativos','Stops desativados','Detalhes da sessão','0 desativa o limite. Os stops usam os saldos que você preencher. Parar não cancela ordens abertas.','Próxima entrada','Sequências perdedoras confirmadas'],
 en:['Bot settings','Mode','Automatic','CALL only','PUT only','Stop Loss · minimum balance','Stop Win · target balance','Martingale','Levels','Multiplier','Losing batch limit','Map controls','Off','Analyzing','Trading','Starting','Stops await balance','Stops active','Stops disabled','Session details','0 disables the limit. Stops use your balance targets. Stop does not cancel open orders.','Next stake','Confirmed losing batches'],
 es:['Configuración del bot','Modo','Automático','Solo CALL','Solo PUT','Stop Loss · saldo mínimo','Stop Win · saldo objetivo','Martingala','Niveles','Multiplicador','Límite de secuencias perdedoras','Mapear controles','Apagado','Analizando','Operando','Activando','Stops esperan saldo','Stops activos','Stops desactivados','Detalles de sesión','0 desactiva el límite. Los stops usan los saldos indicados. Parar no cancela órdenes abiertas.','Próximo importe','Secuencias perdedoras confirmadas'],
 fr:['Réglages du robot','Mode','Automatique','CALL uniquement','PUT uniquement','Stop Loss · solde minimal','Stop Win · solde cible','Martingale','Niveaux','Multiplicateur','Limite des séries perdantes','Repérer les contrôles','Arrêté','Analyse','En opération','Démarrage','Solde attendu pour stops','Stops actifs','Stops désactivés','Détails de séance','0 désactive la limite. Les stops suivent vos soldes cibles. Arrêter ne ferme pas les positions.','Prochaine mise','Séries perdantes confirmées'],
 ar:['إعدادات الروبوت','الوضع','تلقائي','CALL فقط','PUT فقط','حد الرصيد الأدنى','حد الرصيد المستهدف','المضاعفة','المستويات','المضاعف','حد سلاسل الخسارة','تحديد عناصر التحكم','متوقف','يحلل','يتداول','يبدأ','الحدود تنتظر الرصيد','الحدود مفعلة','الحدود معطلة','تفاصيل الجلسة','0 يلغي الحد. الحدود تتبع الرصيد الذي تختاره. الإيقاف لا يغلق الصفقات المفتوحة.','الدخول التالي','سلاسل الخسارة المؤكدة']
 };const l=dict[language]||dict.pt;
 const provider=state.provider==='iq_option'?'IQ Option':state.provider==='exnova'?'Exnova':'';
 const active=state.arming?'arming':state.enabled?(state.suspendedReason?'waiting':state.pending||state.executing?'trading':'scanning'):'off';
 const pnlTone=Number(state.netPnl)>0?'positive':Number(state.netPnl)<0?'negative':'neutral';
 const status=active==='waiting'?(language==='pt'?'BOT LIGADO · EM ESPERA':'BOT ON · WAITING'):language==='pt'?(active==='off'?'BOT PARADO':active==='arming'?'ATIVANDO BOT':active==='trading'?'BOT LIGADO · OPERANDO':'BOT LIGADO · ANALISANDO'):l[{off:12,scanning:13,trading:14,arming:15}[active]];
 const available=state.availableBalance??state.brokerBalance?.amount??null;
 const protectedStops=Number(c.stopLoss)>0||Number(c.stopWin)>0;
 const stopStatus=!protectedStops?l[18]:available==null?l[16]:l[17];
 const input=(key,label,value,step='1')=>'<label style="display:grid;gap:4px;min-width:0">'+label+'<input data-sentinel-executor-setting="'+key+'" type="number" min="'+(key==='martingaleMultiplier'?2:0)+'"'+(key==='martingaleLevels'||key==='martingaleMultiplier'?' max="3"':key==='maxConsecutiveLosses'?' max="50"':'')+' step="'+step+'" value="'+escape(value)+'"'+(state.arming?' disabled':'')+' style="width:100%;min-width:0;box-sizing:border-box;background:rgba(9,31,35,.9);color:#f4faf8;border:1px solid #657977;border-radius:7px;padding:7px;font:inherit"></label>';
 const multiplier=[2,3].includes(Number(c.martingaleMultiplier))?Number(c.martingaleMultiplier):2;
 const clicks=({pt:'clique(s)',en:'click(s)',es:'clic(s)',fr:'clic(s)',ar:'نقرة'})[language]||'click(s)';
 const progression=c.martingaleEnabled?'1 '+clicks+' → 2 '+clicks+' (uma vez)':'1 '+clicks;
 const waiting=Number(state.unresolvedDetail?.waitingResult||0)+Number(state.unresolvedDetail?.waitingId||0)+Number(state.unresolvedDetail?.uncertainAttempts||0);
 const number=value=>Number(value||0).toFixed(2);
 const mappingIssue=[state.message,state.suspendedReason,state.lastError].filter(Boolean).some(v=>/mapear|mapeamento|mapead|mapping|required|map controls|CALL.PUT.*identificad/i.test(String(v)));
 const mapBusy=!!(state.enabled||state.arming||state.pending||state.executing);
 const mapShortcut=mappingIssue?
  '<div data-sentinel-map-problem style="display:flex;align-items:center;gap:8px;margin-top:7px;padding:7px;border:1px solid #b99157;border-radius:8px"><span style="flex:1;font-size:10px">Mapeamento necessário</span><button data-sentinel-executor-action="map"'+(mapBusy?' disabled':'')+' style="padding:7px 9px;border:1px solid #d6b977;border-radius:7px;background:#534225;color:#fff1c9;cursor:pointer">MAPEAR AGORA</button></div>':'';
 const styles='<style>.sentinel-robot{--robot:#91a6a6;position:relative;display:grid;place-items:center;width:38px;height:38px;color:var(--robot);flex:0 0 38px}.sentinel-robot[data-state="scanning"],.sentinel-robot[data-state="arming"],.sentinel-robot[data-state="waiting"]{--robot:#dfc47e}.sentinel-robot[data-state="trading"]{--robot:#75dfb4}.sentinel-robot-orbit{position:absolute;inset:0;border:1px solid currentColor;border-top:2px solid transparent;border-radius:50%}.sentinel-robot:not([data-state="off"]) .sentinel-robot-orbit{animation:sentinel-robot-orbit 3s linear infinite}@keyframes sentinel-robot-orbit{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.sentinel-robot-orbit{animation:none!important}}</style>';
 const summary=
 '<div style="display:flex;align-items:center;gap:9px"><span class="sentinel-robot" data-sentinel-robot data-state="'+active+'" aria-hidden="true"><span class="sentinel-robot-orbit"></span><svg width="25" height="25" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 4v4M7 17H4m24 0h-3M11 26v2m10-2v2"/><rect x="7" y="8" width="18" height="17" rx="5"/><circle cx="12" cy="15" r="1.3" fill="currentColor"/><circle cx="20" cy="15" r="1.3" fill="currentColor"/><path d="M12 21h8"/></svg></span><div style="flex:1"><b>'+w[0]+(provider?' · '+provider:'')+'</b><div data-sentinel-executor-state data-bot-state="'+active+'" style="margin-top:3px;font-weight:850">'+status+'</div></div><strong data-sentinel-executor-balance style="font-size:14px;white-space:nowrap">'+w[13]+': '+(available==null?'—':number(available))+'</strong></div>'+
 '<div style="display:flex;justify-content:space-between;gap:7px;flex-wrap:wrap;margin-top:9px"><b data-sentinel-executor-wl>WIN: '+Number(state.sessionWins||0)+' / LOSS: '+Number(state.sessionLosses||0)+(waiting?' · '+waiting+' pendente(s)':'')+'</b><span data-sentinel-executor-session data-pnl-tone="'+pnlTone+'">'+w[9]+': '+number(state.netPnl)+'</span></div>'+
 '<div data-sentinel-executor-broker-balance style="margin-top:6px;opacity:.8">'+stopStatus+(state.brokerBalance?.receivedAt?' · '+new Date(state.brokerBalance.receivedAt).toLocaleTimeString():'')+'</div>'+
 '<div data-sentinel-executor-next style="margin-top:5px;opacity:.8">'+l[21]+': '+Number(state.nextClicks??1)+' '+clicks+' × '+number(c.amount)+' · '+Number(state.durationMs||0)/1000+' s</div>'+
 '<div data-sentinel-executor-action-msg role="status" style="margin-top:5px;overflow-wrap:anywhere"></div><div data-sentinel-executor-message role="status" style="margin-top:3px;overflow-wrap:anywhere">'+escape(state.message)+'</div>'+mapShortcut;
 const details=
 '<details data-sentinel-preserve-open="1" style="margin-top:8px;border-top:1px solid rgba(155,163,144,.25);padding-top:7px"><summary style="cursor:pointer;font-weight:750">'+l[0]+'</summary><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px">'+
 '<label style="display:grid;gap:4px">'+l[1]+'<select data-sentinel-executor-setting="directionMode" style="padding:7px;max-width:100%;background:#092025;color:#f4faf8;border:1px solid #657977;border-radius:7px">'+['automatic','call','put'].map((mode,i)=>'<option value="'+mode+'"'+((c.directionMode||'automatic')===mode?' selected':'')+'>'+l[i+2]+'</option>').join('')+'</select></label>'+
 (options.externalMartingale?'':'<label style="display:flex;gap:6px;align-items:center"><input data-sentinel-executor-setting="martingaleEnabled" type="checkbox"'+(c.martingaleEnabled?' checked':'')+(state.arming?' disabled':'')+'>'+l[7]+'</label>')+
 input('stopLoss',l[5],c.stopLoss??0,'0.01')+input('stopWin',l[6],c.stopWin??0,'0.01')+
 input('martingaleLevels',l[8],Math.min(3,c.martingaleLevels??2))+input('martingaleMultiplier',l[9],multiplier)+
 input('maxConsecutiveLosses',l[10],c.maxConsecutiveLosses??0)+'</div><div style="margin-top:7px;opacity:.8">'+progression+'</div><small style="display:block;margin-top:7px;line-height:1.4;opacity:.8">'+l[20]+'</small></details>'+
 '<details data-sentinel-preserve-open="1" style="margin-top:7px"><summary style="cursor:pointer;opacity:.7">'+l[19]+'</summary><div data-sentinel-executor-risk style="margin-top:5px">'+l[22]+': '+Number(state.consecutiveLossBatches||0)+' · '+number(state.riskNetPnl)+'</div></details>';
 return {styles,summary,details,active,status,stopStatus,pnlTone};
}

export function executorPanel(state,language='pt',options={}){
 if(!state)return '';const p=executorPanelParts(state,language,options);
 return p.styles+'<section data-sentinel-executor-panel style="margin:8px 0;padding:10px;border:1px solid rgba(172,157,111,.35);border-radius:12px;background:rgba(35,64,62,.07);font-size:11px;color:inherit">'+(options.settingsOnly?'':p.summary)+p.details+'</section>';
}
export function executorMonitor(state,language='pt'){
 if(!state)return '';const p=executorPanelParts(state,language),c=state.config||{},en=language==='en';
 const available=state.availableBalance??state.brokerBalance?.amount??null,n=x=>Number(x||0).toFixed(2);
 const waiting=Number(state.unresolvedDetail?.waitingResult||0)+Number(state.unresolvedDetail?.waitingId||0)+Number(state.unresolvedDetail?.uncertainAttempts||0);
 return p.styles+'<div data-sentinel-executor-monitor><div class="sentinel-monitor-head"><span class="sentinel-robot" data-sentinel-robot data-state="'+p.active+'" aria-hidden="true"><span class="sentinel-robot-orbit"></span><svg width="24" height="24" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 4v4M7 17H4m24 0h-3"/><rect x="7" y="8" width="18" height="17" rx="5"/><circle cx="12" cy="15" r="1.3"/><circle cx="20" cy="15" r="1.3"/><path d="M12 21h8"/></svg></span><b data-sentinel-executor-state data-bot-state="'+p.active+'">'+p.status+'</b><strong data-sentinel-executor-balance>'+(en?'Available':'Disponível')+': '+(available==null?'—':n(available))+'</strong></div>'+
 '<div class="sentinel-monitor-results"><b data-sentinel-executor-wl>WIN: '+Number(state.sessionWins||0)+' / LOSS: '+Number(state.sessionLosses||0)+(waiting?' · '+waiting+' pendente(s)':'')+'</b><span data-sentinel-executor-session data-pnl-tone="'+p.pnlTone+'">'+(en?'Session':'Sessão')+': '+n(state.netPnl)+'</span><span data-sentinel-executor-broker-balance>'+p.stopStatus+'</span></div>'+
 '<div class="sentinel-mg-strip"><label><input data-sentinel-executor-setting="martingaleEnabled" type="checkbox"'+(c.martingaleEnabled?' checked':'')+(state.arming?' disabled':'')+'><span>Martingale</span></label><b data-sentinel-mg-readout>'+(c.martingaleEnabled?'ON · '+Number(state.martingaleLevel||0)+' / '+Math.min(3,Number(c.martingaleLevels||0)):'OFF')+'</b><span data-sentinel-stop-targets>SL '+(c.stopLoss>0?n(c.stopLoss):'—')+' · SW '+(c.stopWin>0?n(c.stopWin):'—')+'</span></div>'+
 '<div data-sentinel-executor-message title="'+escape(state.message)+'" style="font-size:10px;line-height:15px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escape(state.message)+'</div><div data-sentinel-executor-action-msg role="status" style="font-size:10px;line-height:14px"></div></div>';
}

// Small text-only monitor receipt. Build it OUTSIDE the broker tab, so
// settlement updates no longer parse a second, large HTML tree in Chromium.
export function executorMonitorReadout(state,language='pt'){
 if(!state)return null;
 const p=executorPanelParts(state,language),c=state.config||{},en=language==='en';
 const amount=v=>Number(v||0).toFixed(2);
 const available=state.availableBalance??state.brokerBalance?.amount??null;
 const pending=Number(state.unresolvedDetail?.waitingResult||0)+
   Number(state.unresolvedDetail?.waitingId||0)+Number(state.unresolvedDetail?.uncertainAttempts||0);
 return {
  state:p.active,status:p.status,
  balance:(en?'Available':'Disponível')+': '+(available==null?'—':amount(available)),
  winLoss:'WIN: '+Number(state.sessionWins||0)+' / LOSS: '+Number(state.sessionLosses||0)+
   (pending?' · '+pending+' pendente(s)':''),
  session:(en?'Session':'Sessão')+': '+amount(state.netPnl),
  pnlTone:Number(state.netPnl)>0?'positive':Number(state.netPnl)<0?'negative':'neutral',
  brokerBalance:p.stopStatus,
  risk:(['pt','en','es','fr','ar'].includes(language)?({pt:'Sequências perdedoras',en:'Confirmed losing batches',es:'Rachas perdedoras',fr:'Séries perdantes',ar:'سلاسل الخسارة'}[language]):'Sequências perdedoras')+
   ': '+Number(state.consecutiveLossBatches||0)+' · '+amount(state.riskNetPnl),
  message:String(state.message||''),
  martingale:c.martingaleEnabled?'ON · '+Number(state.martingaleLevel||0)+' / 1':'OFF',
  stopTargets:'SL '+(c.stopLoss>0?amount(c.stopLoss):'—')+' · SW '+(c.stopWin>0?amount(c.stopWin):'—'),
  disabledStart:!!(state.enabled||state.arming),
  disabledMap:!!(state.enabled||state.arming||state.pending||state.executing),
  wins:Number(state.sessionWins||0),losses:Number(state.sessionLosses||0)
 };
}
