/**
 * Time-local structural measurements for 13.4.70 candidate.
 *
 * These are data primitives, NOT a common trading signal. Every selected
 * engine decides independently what to do with its own relevant evidence.
 * All inputs and confirmation windows end <= asOf (no future pivots).
 */
const clip=(v,a,b)=>Math.min(b,Math.max(a,v));
export function timedSlope(rows,minSeconds,now){
 const r=rows.filter(x=>x.ts>=now-minSeconds*1000&&x.ts<=now);
 if(r.length<7)return{valid:false,b:0,r2:0,change:0};
 const origin=r[0].ts,values=r.map(x=>({x:(x.ts-origin)/1000,y:x.l}));
 let mx=0,my=0;
 for(const p of values){mx+=p.x;my+=p.y}
 mx/=values.length;my/=values.length;
 let ssx=0,ssy=0,cov=0;
 for(const p of values){
  const dx=p.x-mx,dy=p.y-my;
  ssx+=dx*dx;ssy+=dy*dy;cov+=dx*dy;
 }
 const b=ssx>0?cov/ssx:0,r2=ssx>0&&ssy>0?clip(cov*cov/(ssx*ssy),0,1):0;
 const recent=r.slice(Math.floor(r.length*.52));
 let short=0;
 if(recent.length>=5){
  const t0=recent[0].ts,y0=recent[0].l;
  short=(recent.at(-1).l-y0)/Math.max(.001,(recent.at(-1).ts-t0)/1000);
 }
 return{valid:true,b,r2,change:short-b,n:values.length};
}
export function localVolatilityChange(rows,now,h){
 const latest=rows.filter(x=>x.ts>=now-Math.max(10,Math.min(90,h*.6))*1000);
 const earlier=rows.filter(x=>x.ts>=now-Math.max(40,Math.min(480,h*3))*1000);
 const vol=r=>{
  let sq=0,sec=0,last=null;
  for(const x of r){
   if(last){const dt=(x.ts-last.ts)/1000;if(dt>0&&dt<=12){
     const d=x.l-last.l;sq+=d*d;sec+=dt
   }}last=x;
  }
  return sec>0?Math.sqrt(sq/sec):0
 };
 const short=vol(latest),long=vol(earlier);
 return{short,long,ratio:long>0?clip(short/long,.15,8):1};
}
export function priorConfirmedPivots(rows,now,{
 lookbackSeconds=240,confirmSeconds=3,minimumProminence=0
}={}){
 const recent=rows.filter(x=>x.ts>=now-lookbackSeconds*1000&&x.ts<=now);
 if(recent.length<15)return[];
 const stepMs=Math.max(1000,Math.min(5000,confirmSeconds*500));
 const sampled=[];
 let cursor=recent[0].ts;
 for(const r of recent){
  if(r.ts>=cursor){sampled.push(r);cursor=r.ts+stepMs}
 }
 if(sampled.length<7)return[];
 const width=2,pivots=[];
 for(let i=width;i<sampled.length-width;i++){
  const current=sampled[i],others=sampled.slice(i-width,i+width+1);
  const high=others.every((p,j)=>j===width||current.l>p.l);
  const low=others.every((p,j)=>j===width||current.l<p.l);
  if(!high&&!low)continue;
  const reference=high?Math.max(sampled[i-width].l,sampled[i+width].l):
    Math.min(sampled[i-width].l,sampled[i+width].l);
  const prominence=Math.abs(current.l-reference);
  if(prominence<minimumProminence)continue;
  // Fully confirmed before the forecast timestamp; never assume the current
  // incomplete swing extremum has already formed.
  const confirmedAt=sampled[i+width].ts;
  if(confirmedAt>now)continue;
  const kind=high?'high':'low';
  if(pivots.at(-1)?.kind===kind){
   if(high&&current.l>pivots.at(-1).l||low&&current.l<pivots.at(-1).l)
    pivots[pivots.length-1]={kind,ts:current.ts,l:current.l,confirmedAt,prominence};
  }else pivots.push({kind,ts:current.ts,l:current.l,confirmedAt,prominence});
 }
 return pivots;
}
export function meanReversionAr1(rows,now,{lookbackSeconds=240}={}){
 const recent=rows.filter(x=>x.ts>=now-lookbackSeconds*1000&&x.ts<=now);
 if(recent.length<36)return null;
 // Normalized 2s sampling prevents a 4Hz broker feed from changing
 // the AR(1) horizon merely by sending more quote snapshots.
 const sampled=[],step=2000;
 let lastTs=-Infinity;
 for(const p of recent){
  if(p.ts-lastTs>=step){sampled.push(p);lastTs=p.ts}
 }
 if(sampled.length<20)return null;
 let x=0,y=0,xx=0,xy=0;
 for(let i=1;i<sampled.length;i++){
  const prev=sampled[i-1].l,next=sampled[i].l;
  x+=prev;y+=next;xx+=prev*prev;xy+=prev*next;
 }
 const n=sampled.length-1,den=n*xx-x*x;
 if(!(den>1e-13))return null;
 const phi=(n*xy-x*y)/den,intercept=(y-phi*x)/n;
 if(!Number.isFinite(phi)||!Number.isFinite(intercept))return null;
 let e2=0,varY=0,mean=y/n;
 for(let i=1;i<sampled.length;i++){
  const v=sampled[i].l,u=sampled[i-1].l;
  e2+=(v-intercept-phi*u)**2;
  varY+=(v-mean)**2;
 }
 const fit=varY>0?clip(1-e2/varY,0,1):0;
 const stable=phi>.02&&phi<.9995;
 const equilibrium=stable?intercept/(1-phi):null;
 const low=Math.min(...sampled.map(p=>p.l)),high=Math.max(...sampled.map(p=>p.l));
 const halfLifeSeconds=stable?2*Math.log(.5)/Math.log(phi):null;
 return{phi,equilibrium,halfLifeSeconds,fit,stable,low,high,periodSeconds:2};
}
export function priorTouches(rows,level,now,windowMs){
 const cut=now-Math.max(3000,windowMs),points=rows.filter(x=>x.ts<now&&x.ts>=cut);
 if(points.length<3)return 0;
 let count=0,near=false;
 const tolerance=Math.max(1e-10,(Math.max(...points.map(x=>x.l))-Math.min(...points.map(x=>x.l)))*.06);
 for(const p of points){
  const touching=Math.abs(p.l-level)<=tolerance;
  if(touching&&!near)count++;
  near=touching;
 }
 return count;
}
