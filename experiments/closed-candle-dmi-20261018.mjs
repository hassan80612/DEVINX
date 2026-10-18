// Wilder's directional movement, computed only from received closed candles.
// ADX measures trend strength; +DI/-DI provide direction, never a hit rate.
const epoch=v=>{const n=Number(v);return n>0?(n<1e12?n*1000:n):0;};
export function closedCandleDmi({candles=[],now=Date.now(),period=14}={}){
 const groups=new Map();
 for(const c of candles){
  const from=epoch(c.from??c.ts),to=epoch(c.to??(from+60000));
  const open=Number(c.open),close=Number(c.close),high=Number(c.high??c.max),low=Number(c.low??c.min);
  if(!(from>0&&to>from&&to<=now&&!(Number(c.receivedAt)>now)&&
   [open,close,high,low].every(x=>Number.isFinite(x)&&x>0)&&low<=Math.min(open,close)&&high>=Math.max(open,close)))continue;
  const size=to-from;if(!groups.has(size))groups.set(size,new Map());
  groups.get(size).set(from,{from,to,high,low,close});
 }
 const series=[...groups.values()].map(g=>[...g.values()].sort((a,b)=>a.from-b.from));
 series.sort((a,b)=>b.length-a.length||b.at(-1).to-a.at(-1).to);
 let rows=(series[0]??[]).slice(-100),start=0;
 for(let i=1;i<rows.length;i++)if(rows[i-1].to!==rows[i].from)start=i;
 rows=rows.slice(start);
 const unknown={ready:false,regime:'unknown',side:null,adx:null,previousAdx:null,plusDi:null,minusDi:null,candles:rows.length};
 if(rows.length<period*2)return unknown;
 const movements=rows.slice(1).map((c,i)=>{
  const old=rows[i],up=c.high-old.high,down=old.low-c.low;
  return {tr:Math.max(c.high-c.low,Math.abs(c.high-old.close),Math.abs(c.low-old.close)),
   plus:up>0&&up>down?up:0,minus:down>0&&down>up?down:0};
 });
 let tr=0,plus=0,minus=0,adx=null,previousAdx=null,plusDi=0,minusDi=0;
 const dx=[];
 for(let i=0;i<movements.length;i++){
  const m=movements[i];
  // Seed period-1 deltas, then smooth before the first DX, matching the
  // reference TA-Lib ADX initialization rather than treating 14 deltas as 14 bars.
  if(i<period-1){tr+=m.tr;plus+=m.plus;minus+=m.minus;}else{
   tr=tr-tr/period+m.tr;plus=plus-plus/period+m.plus;minus=minus-minus/period+m.minus;
  }
  if(i<period-1)continue;
  plusDi=tr?100*plus/tr:0;minusDi=tr?100*minus/tr:0;
  const value=plusDi+minusDi?100*Math.abs(plusDi-minusDi)/(plusDi+minusDi):0;
  if(adx===null){dx.push(value);if(dx.length===period)adx=dx.reduce((a,b)=>a+b,0)/period;}
  else{previousAdx=adx;adx=(adx*(period-1)+value)/period;}
 }
 if(adx===null)return unknown;
 return {ready:true,regime:adx>=25?'trend':adx<20?'range':'transition',
  side:plusDi>minusDi?'CALL':minusDi>plusDi?'PUT':null,
  adx,previousAdx,plusDi,minusDi,candles:rows.length,periodMs:rows.at(-1).to-rows.at(-1).from};
}
