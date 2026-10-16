// RESEARCH ONLY. Compare a 20s local trend with the released 30s forecast.
// Select using already observed 30s binary outcomes, never historical fit alone.
export class CompletedOutcomeSelector{
 constructor(){this.context=null;this.pending=[];this.loss={base:.5,trend:.5};this.completed=0;this.lastIssued=-Infinity;}
 observe({context='one-market',rows,now,price,base,alternative=null}){
  if(this.context!==context){this.context=context;this.pending=[];this.loss={base:.5,trend:.5};this.completed=0;this.lastIssued=-Infinity;}
  const pending=[];
  for(const p of this.pending){
   if(now<p.at+30000){pending.push(p);continue;}
   if(now>p.at+31000||price===p.price)continue;
   const side=price>p.price?'CALL':'PUT';
   for(const name of ['base','trend'])this.loss[name]=.8*this.loss[name]+.2*(p[name]===side?0:1);
   this.completed++;
  }
  this.pending=pending;
  if(!base.ready)return base;
  const seen=rows.filter(q=>q.ts<=now&&(q.receivedAt??q.ts)<=now&&q.ts>=now-20000),points=[];
  let j=seen.length-1;
  for(let t=now;t>=now-20000;t-=1000){
   while(j>=0&&seen[j].ts>t)j--;
   if(j>=0&&t-seen[j].ts<=1000)points.push({t:(t-now)/1000,y:Math.log(seen[j].price/price)});
  }
  if(points.length<15)return base;
  const mean=points.reduce((s,p)=>s+p.t,0)/points.length;
  const slope=points.reduce((s,p)=>s+(p.t-mean)*p.y,0)/points.reduce((s,p)=>s+(p.t-mean)**2,0);
  const trend=alternative?.ready&&['CALL','PUT'].includes(alternative.side)?alternative.side:slope>0?'CALL':slope<0?'PUT':base.side;
  if(now-this.lastIssued>=5000){this.lastIssued=now;this.pending.push({at:now,price,base:base.side,trend});}
  const chosen=this.completed>=5&&this.loss.trend+.1<this.loss.base?'trend':'base';
  return {...base,side:chosen==='trend'?trend:base.side,researchSelected:chosen,researchCompleted:this.completed};
 }
}
