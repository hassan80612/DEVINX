// VNext PC window acceptance. A quote can be a few milliseconds older than
// the worker evaluation time without belonging to a previous signal window.
export function shouldDiscardVnextFrame({analysis,quoteAt=0,now=Date.now(),switched=false}={}){
 if(!analysis||switched)return true;
 const cycle=analysis.vnext?.opportunityWindow||null;
 const startedAt=Number(cycle?.windowStartedAt||0);
 const endsAt=Number(cycle?.windowEndsAt||0);
 if(endsAt>0&&now>=endsAt)return true;
 // A scan is NOT a window. Do not hide the actual market analysis simply
 // because worker processing time is ahead of the most recent broker tick.
 if(analysis.vnext?.mode==='now'&&cycle?.phase==='scanning')return false;
 return startedAt>0&&Number(quoteAt)<startedAt;
}
