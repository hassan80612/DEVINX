// Offline candidate: learns the requested forward return from completed past
// outcomes. No forming-candle gate, external strategy votes or future labels.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function solve(a,b){const m=a.map((r,i)=>[...r,b[i]]),n=b.length;for(let k=0;k<n;k++){let p=k;for(let i=k+1;i<n;i++)if(Math.abs(m[i][k])>Math.abs(m[p][k]))p=i;if(Math.abs(m[p][k])<1e-12)return null;[m[k],m[p]]=[m[p],m[k]];const v=m[k][k];for(let j=k;j<=n;j++)m[k][j]/=v;for(let i=0;i<n;i++){if(i===k)continue;const v=m[i][k];for(let j=k;j<=n;j++)m[i][j]-=v*m[k][j];}}return m.map(r=>r[n]);}
const dot=(x,b)=>x.reduce((v,a,i)=>v+a*b[i],0);
function cycleForWindow(lp,h,window){
 const data=lp.slice(-window),start=data.length-1,N=data.length,split=Math.floor(N*.7);
 const basis=(t,period)=>[1,(t-start)/600,Math.sin(t*2*Math.PI/period),Math.cos(t*2*Math.PI/period)];
 const regress=(end,period)=>{const a=Array.from({length:4},()=>Array(4).fill(0)),b=Array(4).fill(0);for(let t=0;t<end;t+=5){const x=basis(t,period),y=data[t];for(let j=0;j<4;j++){b[j]+=x[j]*y;for(let k=0;k<4;k++)a[j][k]+=x[j]*x[k];}}return solve(a,b);};
 let best=null,error=Infinity;for(let period=80;period<=Math.min(1800,window/2);period+=10){const beta=regress(split,period);if(!beta)continue;let e=0;for(let t=0;t<split;t+=5)e+=(dot(basis(t,period),beta)-data[t])**2;if(e<error){error=e;best={period,beta};}}
 if(!best)return null;let valid=0,naive=0,total=0;const mean=data.slice(0,split).reduce((a,b)=>a+b,0)/split;
 for(let t=split;t<N;t+=5){valid+=(dot(basis(t,best.period),best.beta)-data[t])**2;naive+=(data[t]-data[split-1])**2;}
 for(let t=0;t<split;t+=5)total+=(data[t]-mean)**2;
 let tx=0,ty=0,txx=0,txy=0,tn=0;for(let t=0;t<split;t+=5){const x=(t-start)/600;tx+=x;ty+=data[t];txx+=x*x;txy+=x*data[t];tn++;}const linearSlope=(txy-tx*ty/tn)/(txx-tx*tx/tn),linearIntercept=(ty-linearSlope*tx)/tn;let linearError=0;for(let t=0;t<split;t+=5)linearError+=(data[t]-linearIntercept-linearSlope*(t-start)/600)**2;
 if(linearError<=Math.max(1e-24,total*1e-8))return null;
 const explained=1-error/Math.max(1e-15,total),quality=1-valid/Math.max(1e-15,naive),explainedCycle=1-error/Math.max(1e-15,linearError);
 if(explained<.55||quality<.25||explainedCycle<.4)return null;
 const beta=regress(N,best.period);if(!beta)return null;
 const move=dot(basis(start+h,best.period),beta)-dot(basis(start,best.period),beta);
 return {move,period:best.period,explained,explainedCycle,quality};
}
function cycleProjection(lp,h){
 const models=[900,1500,2400].map(w=>cycleForWindow(lp,h,w)).filter(Boolean);
 return models.sort((a,b)=>b.quality*b.explained-a.quality*a.explained)[0]||null;
}
function fit(rows,penalty,halfLife){const n=rows[0].x.length,a=Array.from({length:n},()=>Array(n).fill(0)),b=Array(n).fill(0);let total=0;const end=rows.at(-1).i;for(const r of rows){const w=Math.exp(-Math.LN2*(end-r.i)/halfLife);total+=w;for(let j=0;j<n;j++){b[j]+=w*r.x[j]*r.y;for(let k=0;k<=j;k++)a[j][k]+=w*r.x[j]*r.x[k];}}for(let j=0;j<n;j++){for(let k=j+1;k<n;k++)a[j][k]=a[k][j];a[j][j]+=(j===0?1e-8:penalty*total);}return solve(a,b);}
export function structureForecast({quoteHistory=[],asOf,selectedSeconds=60,diagnostics=null}={}){
 const h=Number(selectedSeconds),seen=new Map();for(const q of quoteHistory){const ts=Number(q.ts),p=Number(q.price),arr=Number(q.receivedAt??ts);if(ts<=asOf&&arr<=asOf&&Number.isFinite(ts)&&p>0&&Number.isFinite(p)&&Number.isFinite(arr)){const item={ts,p,readyAt:Math.max(ts,arr)};if(!seen.has(ts)||item.readyAt<seen.get(ts).readyAt)seen.set(ts,item);}}
 if(diagnostics)Object.assign(diagnostics,{status:'waiting-history',historySeconds:0,requiredSeconds:Math.max(720+h,601+h+29*Math.max(5,Math.floor(h/6)))});
 const events=[...seen.values()].sort((a,b)=>a.readyAt-b.readyAt||a.ts-b.ts);if(!events.length||!(h>0))return null;
 // Features at a past anchor see only quotes that had ARRIVED by that anchor.
 const lp=[];let j=0,latest=null;const end=Math.floor(asOf/1000)*1000;for(let t=Math.ceil(events[0].readyAt/1000)*1000;t<=end;t+=1000){while(j<events.length&&events[j].readyAt<=t){const e=events[j++];if(!latest||e.ts>latest.ts)latest=e;}if(!latest||t-latest.ts>2500){lp.length=0;continue;}lp.push(Math.log(latest.p));}
 if(diagnostics)diagnostics.historySeconds=lp.length;
 if(!latest||asOf-latest.ts>2500){if(diagnostics)diagnostics.status='waiting-quote';return null;}const last=[latest.ts,latest.p];
 const n=lp.length,lag=600;if(n<lag+h+120)return null;
 const sum=[0],sq=[0],absolute=[0];for(let i=0;i<n;i++){const r=i?lp[i]-lp[i-1]:0;sum.push(sum.at(-1)+lp[i]);sq.push(sq.at(-1)+r*r);absolute.push(absolute.at(-1)+Math.abs(r));}
 const sigma=i=>Math.sqrt(Math.max(1e-14,(sq[i+1]-sq[i-119])/120));
 const features=i=>{const s=sigma(i),scale=s*Math.sqrt(h),moves=[5,15,30,60,90,120,180,240,360,600].map(w=>clamp((lp[i]-lp[i-w])/(s*Math.sqrt(w)),-12,12));const mean=w=>(sum[i+1]-sum[i+1-w])/w;const bars=[0,1,2].map(k=>(lp[i-k*30]-lp[i-(k+1)*30])/(s*Math.sqrt(30)));return {scale,x:[1,...moves,clamp((lp[i]-mean(120))/(s*Math.sqrt(120)),-12,12),clamp((lp[i]-mean(360))/(s*Math.sqrt(360)),-12,12),clamp(bars[0]-bars[1],-12,12),clamp(bars[1]-bars[2],-12,12)]};};
 const samples=[],stride=Math.max(5,Math.floor(h/6));for(let i=lag;i+h<n;i+=stride){const f=features(i);samples.push({i,x:f.x,y:clamp((lp[i+h]-lp[i])/f.scale,-20,20)});}
 if(samples.length<30)return null;const split=Math.floor(samples.length*.7),validation=samples.slice(split),first=validation[0].i,train=samples.slice(0,split).filter(r=>r.i+h<first);
 let choice={penalty:1,halfLife:1200},loss=Infinity;
 if(train.length>=24&&validation.length>=8)for(const penalty of [.1,1,10])for(const halfLife of [600,1800]){const beta=fit(train,penalty,halfLife);if(!beta)continue;const error=validation.reduce((v,r)=>v+Math.min(25,(dot(r.x,beta)-r.y)**2),0)/validation.length;if(error<loss){loss=error;choice={penalty,halfLife};}}
 let sx=0,sy=0,sxx=0,sxy=0;const start=Math.max(0,n-1200);for(let i=start;i<n-1;i++){sx+=lp[i];sy+=lp[i+1]-lp[i];sxx+=lp[i]*lp[i];sxy+=lp[i]*(lp[i+1]-lp[i]);}const count=n-start-1,denom=sxx-sx*sx/count,slope=denom>0?(sxy-sx*sy/count)/denom:0,intercept=sy/count-slope*sx/count;let residual=0;for(let i=start;i<n-1;i++)residual+=(lp[i+1]-lp[i]-intercept-slope*lp[i])**2;const slopeSE=denom>0?Math.sqrt(residual/(count-2)/denom):Infinity;const meanReversionEvidence={rate:-slope,tStatistic:slopeSE>0?-slope/slopeSE:0};
 const beta=fit(samples,choice.penalty,choice.halfLife);if(!beta)return null;const f=features(n-1),cycle=cycleProjection(lp,h),direct=clamp(dot(f.x,beta),-4,4)*f.scale;
 if(diagnostics)diagnostics.status='ready';
 const weight=cycle?clamp(cycle.quality,0,.8):0,move=clamp((direct*(1-weight)+(cycle?.move||0)*weight)/f.scale,-4,4)*f.scale,price=last[1]*Math.exp(move);
 return {side:move>=0?'CALL':'PUT',projectedPrice:price,expectedLow:last[1]*Math.exp(move-1.5*f.scale),expectedHigh:last[1]*Math.exp(move+1.5*f.scale),referencePrice:last[1],issuedAt:asOf,targetAt:asOf+h*1000,choice,cycle,meanReversionEvidence,cycleWeight:weight,trainingExamples:samples.length,latestTrainingOutcomeAt:last[0],historySeconds:n,validationLoss:Number.isFinite(loss)?loss:null};
}
