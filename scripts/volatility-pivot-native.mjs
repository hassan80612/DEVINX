// Explicit private input/output paths. Never commits broker/video data.
import {readFileSync,writeFileSync} from 'node:fs';
import {replayPivots} from './volatility-pivot-compare.mjs';
const input=process.argv[2],output=process.argv[3];if(!input||!output)throw Error('Private source report and private output paths required');
const d=JSON.parse(readFileSync(input,'utf8')),T=1800000000000;
const samples=[];
if(d.videoTranscription?.quotes){
 const qs=d.videoTranscription.quotes.filter(q=>q.price>0).map(q=>({ts:T+Math.round(q.videoSecond*1000),price:q.price}));
 samples.push({name:'known-user-video-approximate-ocr',limitation:'Approximate video frame timestamps, not native broker receipts; no exact original analyst inputs or original signal trace.',quotes:qs});
}
if(d.nativeMemoryDiagnostic?.quotes)samples.push({name:'known-owner-memory-quote-buffer',limitation:'One short native memory buffer; quote receipt times absent in export, only price-series diagnostics; original analyst state and 100-candle context are incomplete.',quotes:d.nativeMemoryDiagnostic.quotes});
if(d.liveSignedObservation?.quotes)samples.push({name:'known-owner-signed-observer',limitation:'Observer receipt times differ from Agent receipt times; four original calls do not provide independent validation of this detector.',quotes:d.liveSignedObservation.quotes});
const results=samples.map(s=>({...s,quotes:undefined,observations:s.quotes.length,...replayPivots({asset:s.name,quotes:s.quotes,metadata:{expiryQuotePolicy:'asof-observed-within-1s'}})}));
writeFileSync(output,JSON.stringify({method:'Exploratory quote-direction replay only. Each actual candidate decision is graded using the last observed source quote at or before its 30s deadline, maximum age 1s. No trade settlements, interpolation, original analyst accuracy comparison, or release validation.',results},null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(results.map(r=>({name:r.name,observations:r.observations,metrics:r.metrics,pivotToEntrySeconds:r.pivotToEntrySeconds}))));
