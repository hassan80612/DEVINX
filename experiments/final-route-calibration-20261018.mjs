// Research hypothesis. Training accuracy is not a validated future probability.
export function applyFinalRouteCalibration({candidate,model,durationMs=30000}){
 if(durationMs!==30000||candidate?.ready!==true||!['CALL','PUT'].includes(candidate.side))return candidate;
 const row=model.routes.find(x=>x.reason===candidate.reason);
 if(!row||row.n<model.minimumCompleted||row.invert!==true)return candidate;
 return {...candidate,side:candidate.side==='CALL'?'PUT':'CALL',predictedPrice:null,expectedLogMove:null,strength:null,
  reason:'research-inverted-'+candidate.reason,
  recalibration:{originalReason:candidate.reason,originalSide:candidate.side,trainingCompleted:row.n,trainingMean:row.posteriorMean}};
}
