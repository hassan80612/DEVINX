const START=1800000000000;
export function generate(seed,kind,len=5400){
 let state=seed>>>0,price=Math.log(1.1),last=0,origin=price,age=0,phase=0,nextSwitch=0,regime=0;
 const u=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)+1)/4294967297;
 const samples=[];
 for(let i=0;i<len;i++){
  const x=u(),y=u(),z=u(),g=Math.sqrt(-2*Math.log(x))*Math.cos(2*Math.PI*y);
  let move=g*.000011;
  if(kind==='trend')move+=(i%1400<850?.000006:-.000005)+.24*last;
  if(kind==='range')move+=-.09*(price-origin)-.25*last;
  if(kind==='cycle'){
   const period=72+seed%53;
   const wave=t=>.0007*Math.sin(2*Math.PI*t/period+seed*.2)+.00019*Math.sin(2*Math.PI*t/(period*.43));
   move+=wave(i)-wave(i-1);
  }
  if(kind==='reversal')move+=(Math.floor(i/175)%2?.000006:-.000006)+.13*last;
  if(kind==='false_breakout')move+=(i%240<24?.000014:i%240<70?-.000013:0)-.04*(price-origin);
  if(kind==='breakout')move+=(i%415<85?.0000003:i%415<178?.000007:0)+.13*last;
  if(kind==='volatility')move+=g*((i%680>240&&i%680<490)?.000023:.000002)+(z<.022?(y<.5?-.00008:.00008):0)-.28*last-.015*(price-origin);
  if(kind==='random')move+=g*.000005;
  if(kind==='regime_switch'){
   if(i>=nextSwitch){regime=Math.floor(u()*4);nextSwitch=i+120+Math.floor(u()*600);origin=price;age=0;phase=u()*Math.PI*2;}
   if(regime===0)move+=.000007+.25*last;
   if(regime===1)move+=-.000007+.25*last;
   if(regime===2){const w=t=>.0005*Math.sin(t*.065+phase);move+=w(age)-w(age-1);}
   if(regime===3)move+=-.035*(price-origin)-.3*last+g*.000012;
   age++;
  }
  if(kind==='exhaustion'){
   const period=350+seed%101,t=i%period,sign=Math.floor(i/period)%2?1:-1;
   move+=sign*(t<180?.000010*(1-t/230):t<280?-.000008:0)+.15*last;
  }
  price+=move;last=move;samples.push({ts:START+i*1000,price:Math.exp(price)});
 }
 return samples;
}
