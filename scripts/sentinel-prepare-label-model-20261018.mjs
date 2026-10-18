import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expiryLabelFeatures} from '../experiments/expiry-label-features-20261018.mjs';
import {expiryQuote} from '../experiments/replay-expiry-quote-20261017.mjs';
const spec={trainBefore:'2020-03-30T12:00:00Z',validationFrom:'2020-03-30T12:00:00Z',validationUntil:'2020-03-30T15:00:00Z',
 models:{logistic:{C:1,max_iter:1000,standardize:true},randomForest:{n_estimators:128,max_depth:4,min_samples_leaf:30,random_state:20261018,n_jobs:2}},
 overrideThreshold:.6,selection:{minimumValidationGain:.02,minimumOverriddenEntries:10,maximumValidationBrier:.25},
 rule:'Train directly on completed 30s bid outcomes at nonoverlapping actual quoted origins, before noon. Features use only previous 180s quotes and 50 received closed 1m candles. Validate on original runtime entries from noon to 15h. Select once, then evaluate later periods. Strong predictions can change side, never readiness, entry price, time or duration. No model parameter or threshold optimization.',
 limits:['One known Forex day for training, not broker OTC.','Validation outcomes are previously inspected research data.','Later-period and different-day tests are out of the model training interval, but the source streams were already accessible.','Probability outputs are model estimates; a .6 threshold is not a demonstrated 60% or 90% hit rate.','No lookahead, time-of-day or fabricated volume features.']};
writeFileSync(new URL('../reports/sentinel-label-model-spec-20261018.json',import.meta.url),JSON.stringify(spec,null,2)+'\n');
const bytes=readFileSync(new URL('../../research-data/dukascopy-eurusd-example.json',import.meta.url));
if(createHash('sha256').update(bytes).digest('hex')!=='df4c6d7b089c46b73545eb5e9a5207c1ee40ce7375aaa5ba318d1f7963670403')throw Error('Unexpected source');
const raw=JSON.parse(bytes),quotes=[...new Map(raw.map(q=>[q.timestamp,{ts:q.timestamp,price:q.bidPrice,receivedAt:q.timestamp}])).values()].sort((a,b)=>a.ts-b.ts);
function makeCandles(qs){const m=new Map();for(const q of qs){const t=Math.floor(q.ts/60000)*60000;
 if(!m.has(t))m.set(t,{from:t/1000,to:t/1000+60,open:q.price,close:q.price,high:q.price,low:q.price,receivedAt:t+60000});
 const c=m.get(t);c.close=q.price;c.high=Math.max(c.high,q.price);c.low=Math.min(c.low,q.price);}return [...m.values()];}
const candles=makeCandles(quotes),training=[],frames=[];let featureNames=null;
function featureAt(qs,cs,q){
 let lo=0,hi=qs.length;while(lo<hi){const m=(lo+hi)>>>1;if(qs[m].ts<=q.ts)lo=m+1;else hi=m;}
 const end=lo;while(lo>0&&qs[lo-1].ts>=q.ts-180000)lo--;
 let ci=0,cj=cs.length;while(ci<cj){const m=(ci+cj)>>>1;if(cs[m].to*1000<=q.ts)ci=m+1;else cj=m;}
 const h=qs.slice(lo,end),rows=cs.slice(Math.max(0,ci-50),ci);
 return expiryLabelFeatures({quoteHistory:h,candles:rows,price:q.price,quoteAt:q.ts,now:q.ts});
}
let next=quotes[0].ts+50*60000;
const cutoff=Date.parse(spec.trainBefore);
for(const q of quotes){
 if(q.ts<next)continue;if(q.ts+30000>=cutoff)break;next=q.ts+30000;
 const f=featureAt(quotes,candles,q),exit=expiryQuote(quotes,q.ts+30000,'asof-complete-bid-stream');
 if(!f||!exit||exit.price===q.price)continue;featureNames=f.names;
 training.push({at:q.ts,features:f.values,label:exit.price>q.price?1:0});
}
const previous=JSON.parse(readFileSync(new URL('../reports/sentinel-13937-postrelease-origin-benchmark-20261018.json',import.meta.url)));
for(const run of previous.results){
 const video=run.kind==='known-video',official=run.name.startsWith('available-official-');
 const data=JSON.parse(readFileSync(new URL('../tests/fixtures/'+(video?run.name:'external/dukascopy-eurusd-'+run.name+'.json'),import.meta.url)));
 const qs=video?data.quoteHistory:official?data.quotes:quotes,cs=video?[]:official?data.candles:candles;
 for(const entry of run.entries){
  const f=featureAt(qs,cs,{ts:entry.at,price:entry.price});
  const split=video?'video':official?'different-day-known':entry.at<cutoff?'in-sample-reference':entry.at<Date.parse(spec.validationUntil)?'validation':'later-test';
  frames.push({...entry,reason:undefined,naive:undefined,window:run.name,split,features:f?.values??null});
 }
}
const dataset={spec,featureNames,training,frames};
writeFileSync(new URL('../reports/sentinel-label-model-dataset-20261018.json',import.meta.url),JSON.stringify(dataset)+'\n');
console.log(JSON.stringify({training:training.length,features:featureNames.length,frames:frames.length,available:frames.filter(x=>x.features).length,
 splits:Object.fromEntries([...new Set(frames.map(x=>x.split))].map(s=>[s,frames.filter(x=>x.split===s).length]))}));
