// Exploratory only. Actual nonoverlapping issued-entry outcomes; no extra data read.
export class OnlineFinalRoute{
 constructor({minimum=12,limit=24}={}){this.minimum=minimum;this.limit=limit;this.rows=new Map();}
 record({context,reason,result}){if(!['win','loss'].includes(result))return;const key=context+'|'+reason,rows=this.rows.get(key)||[];rows.push(result);this.rows.set(key,rows.slice(-this.limit));}
 select({context,reason,side}){const rows=this.rows.get(context+'|'+reason)||[],wins=rows.filter(x=>x==='win').length,losses=rows.length-wins;return{side:rows.length>=this.minimum&&wins<losses?(side==='CALL'?'PUT':'CALL'):side,completed:rows.length,wins,losses};}
}
