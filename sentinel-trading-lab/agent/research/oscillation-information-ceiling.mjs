/**
 * Reproducible information ceiling for ONE precisely-defined synthetic
 * irregular oscillator. Not market data, not a promise or universal ceiling.
 *
 * Gaussian linear Markov process:
 *   delta[t+1] = -0.08*x[t] - 0.47*delta[t] + noise[t+1]
 *   x[t+1]     = x[t] + delta[t+1]
 *   noise ~ Normal(0,0.000013^2) independently
 *
 * State z=(x, delta); z[t+1] = A*z[t] + B*noise[t+1].
 * For entry after H and expiry after 2H:
 *   outcome = e1*(A^(2H)-A^H)*z[t] + future noise.
 *
 * An omniscient forecaster that knows TRUE A, B, sigma, and z[t] predicts
 * sign(E[outcome|z[t]]). Stationary joint Gaussian yields exact expected
 * sign accuracy 0.5+asin(rho)/pi, where rho is correlation between the
 * optimal conditional expectation and realized outcome.
 *
 * It is a bound for this simulated process, not for OTC/IQ Option/Exnova.
 */
import assert from 'node:assert/strict';

const A=[[.92,-.47],[-.08,-.47]],B=[1,1],sigma=.000013;
const times=(P,Q)=>P.map(row=>Q[0].map((_,j)=>
 row.reduce((s,e,k)=>s+e*Q[k][j],0)));
const transpose=M=>M[0].map((_,j)=>M.map(row=>row[j]));
const add=(M,N)=>M.map((row,i)=>row.map((v,j)=>v+N[i][j]));
const ident=[[1,0],[0,1]];
function covariance(){
 let S=[[0,0],[0,0]];
 const BB=B.map(v=>B.map(w=>sigma*sigma*v*w));
 for(let k=0;k<1400;k++)S=add(times(times(A,S),transpose(A)),BB);
 return S;
}
function powers(n){
 const out=[ident];
 for(let i=0;i<n;i++)out.push(times(A,out.at(-1)));
 return out;
}
function quadratic(row,S){
 const y=[row[0]*S[0][0]+row[1]*S[1][0],
          row[0]*S[0][1]+row[1]*S[1][1]];
 return row[0]*y[0]+row[1]*y[1];
}
function noiseKernel(P,j,H){
 const n=2*H-j,p=P[n][0][0]*B[0]+P[n][0][1]*B[1];
 if(j>H)return p;
 const m=H-j;
 return p-(P[m][0][0]*B[0]+P[m][0][1]*B[1]);
}
export function oracleOscillationInformationLimit(H){
 const h=Number(H);if(!Number.isInteger(h)||h<=0)throw Error('invalid horizon');
 const P=powers(2*h);
 const c=P[2*h][0].map((v,i)=>v-P[h][0][i]);
 const signal=Math.max(0,quadratic(c,covariance()));
 let future=0;
 for(let j=1;j<=2*h;j++)future+=noiseKernel(P,j,h)**2*sigma**2;
 const rho=Math.sqrt(signal/(signal+future));
 return {horizonSeconds:h,oracleAccuracyPercent:
   Number((100*(.5+Math.asin(Math.min(1,rho))/Math.PI)).toFixed(4)),
   knownFutureInformationRatio:signal/(signal+future),
   regime:'specified-stationary-Gaussian-irregular-oscillator',
   actualBrokerData:false};
}
const results=[5,10,30,60,120,300].map(oracleOscillationInformationLimit);
const expected=[57.21,57.74,53.67,50.77,50.03,50.00];
for(let i=0;i<results.length;i++)
 assert.ok(Math.abs(results[i].oracleAccuracyPercent-expected[i])<.09,
  'analytic result must match independently derived stationary Gaussian formula '+JSON.stringify(results[i]));
console.log('SENTINEL_ORACLE_IRREGULAR_OSCILLATION='+JSON.stringify(results));
