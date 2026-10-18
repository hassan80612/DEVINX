"""Fixed models of completed 30-second outcomes; chronological selection only."""
import json
from pathlib import Path
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from scipy.stats import binomtest

ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'reports/sentinel-label-model-dataset-20261018.json').read_text())
spec=data['spec']; training=data['training']
X=np.asarray([r['features'] for r in training],dtype=float)
y=np.asarray([r['label'] for r in training],dtype=int)
assert max(r['at']+30000 for r in training)<__import__('datetime').datetime.fromisoformat(spec['trainBefore'].replace('Z','+00:00')).timestamp()*1000
scaler=StandardScaler().fit(X)
logistic=LogisticRegression(C=1,max_iter=1000).fit(scaler.transform(X),y)
forest=RandomForestClassifier(**spec['models']['randomForest']).fit(X,y)
models={'logistic':(logistic,lambda xs:scaler.transform(xs)), 'randomForest':(forest,lambda xs:xs)}

def assess(frames,name):
 model,transform=models[name]
 valid=[f for f in frames if f['features'] is not None]
 ps=model.predict_proba(transform(np.asarray([f['features'] for f in valid])))[:,1] if valid else []
 predictions={f['at']:float(p) for f,p in zip(valid,ps)}
 base_w=base_l=new_w=new_l=corrected=spoiled=overrides=0; errors=[]; entries=[]
 for f in frames:
  p=predictions.get(f['at']); side=f['side']
  if p is not None and max(p,1-p)>=spec['overrideThreshold']:side='CALL' if p>.5 else 'PUT'
  changed=side!=f['side'];overrides+=changed
  result=f['result']
  if result in ['win','loss']:
   actual=f['side'] if result=='win' else ('PUT' if f['side']=='CALL' else 'CALL')
   base_w+=result=='win';base_l+=result=='loss'
   win=side==actual;new_w+=win;new_l+=not win
   corrected+=result=='loss' and win;spoiled+=result=='win' and not win
   if p is not None:errors.append((p-(actual=='CALL'))**2)
   result='win' if win else 'loss'
  entries.append({k:v for k,v in f.items() if k!='features'}|{'newSide':side,'newResult':result,'modelProbability':p})
 n=corrected+spoiled
 return {'baseline':{'win':base_w,'loss':base_l,'winRate':base_w/(base_w+base_l) if base_w+base_l else None},
  'candidate':{'win':new_w,'loss':new_l,'winRate':new_w/(new_w+new_l) if new_w+new_l else None},
  'entries':len(frames),'featureAvailable':len(valid),'overrides':overrides,'corrected':corrected,'spoiled':spoiled,
  'brier':float(np.mean(errors)) if errors else None,
  'pairedDisagreementP':float(binomtest(corrected,n,.5).pvalue) if n else None,
  'records':entries}

validation=[f for f in data['frames'] if f['split']=='validation']
validation_results={name:assess(validation,name) for name in models}
candidates=[]
for name,r in validation_results.items():
 gain=r['candidate']['winRate']-r['baseline']['winRate']
 c=spec['selection']
 if gain>=c['minimumValidationGain'] and r['overrides']>=c['minimumOverriddenEntries'] and r['brier']<=c['maximumValidationBrier']:
  candidates.append((gain,name))
candidates.sort(reverse=True);winner=candidates[0][1] if candidates else None

def export(name):
 if name=='logistic':return {'kind':'logistic','means':scaler.mean_.tolist(),'scales':scaler.scale_.tolist(),
  'coefficients':logistic.coef_[0].tolist(),'intercept':float(logistic.intercept_[0])}
 trees=[]
 for estimator in forest.estimators_:
  t=estimator.tree_;nodes=[]
  for i in range(t.node_count):
   v=t.value[i,0];nodes.append({'feature':int(t.feature[i]),'threshold':float(t.threshold[i]),
    'left':int(t.children_left[i]),'right':int(t.children_right[i]),'probability':float(v[1]/v.sum())})
  trees.append(nodes)
 return {'kind':'forest','trees':trees}

# Freeze artifacts before evaluating any later or different-day frame.
exported={name:export(name)|{'featureNames':data['featureNames'],'threshold':spec['overrideThreshold']} for name in models}
(ROOT/'experiments/sentinel-expiry-label-models-20261018.json').write_text(json.dumps(exported,separators=(',',':'))+'\n')
(ROOT/'reports/sentinel-label-model-selection-20261018.json').write_text(json.dumps({'winner':winner,'validation':validation_results,'spec':spec},indent=2)+'\n')
heldout={}
if winner:
 for split in ['later-test','different-day-known','video']:
  heldout[split]=assess([f for f in data['frames'] if f['split']==split],winner)
result={'spec':spec,'trainingSamples':len(training),'features':len(data['featureNames']),'trainingLastAt':max(r['at'] for r in training),
 'winner':winner,'validation':validation_results,'heldout':heldout,
 'limitations':['These are side predictions on fixed original runtime entry timestamps. Integration into the actual runtime must independently preserve those timestamps.',
 'No later/different-day outcomes are used in training or selecting the model. All prior source-stream accessibility is disclosed in the specification.',
 'Paired binomial diagnostics assume independent disagreements; temporal dependence can make this optimistic. They are not a profitability proof.']}
(ROOT/'reports/sentinel-label-model-research-20261018.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:({n:{a:b for a,b in r.items() if a!='records'} for n,r in v.items()} if k in ['validation','heldout'] else v)
 for k,v in result.items() if k not in ['spec','limitations']},indent=2))
