import json,pathlib,hashlib,numpy as np
from sklearn.linear_model import LogisticRegression
R=pathlib.Path(__file__).resolve().parents[1]
read=lambda p:json.loads((R/p).read_text())
d=read('research/expiry-endpoint-training-20261019.json');X=np.array([r['features'] for r in d['rows']]);y=np.array([r['y'] for r in d['rows']])
scale=np.sqrt(np.mean(X*X,axis=0));scale[scale<1e-12]=1
A=np.concatenate([X,-X])/scale;B=np.concatenate([y,1-y])
m=LogisticRegression(C=.1,fit_intercept=False,solver='lbfgs',max_iter=2000).fit(A,B)
model={'model':'research-logistic-30s-v1','featureNames':d['featureNames'],'scale':scale.tolist(),'coefficients':m.coef_[0].tolist(),'trainingRows':len(X),'trainingSha256':hashlib.sha256((R/'research/expiry-endpoint-training-20261019.json').read_bytes()).hexdigest()}
(R/'reports/sentinel-expiry-endpoint-model-20261019.json').write_text(json.dumps(model,indent=2)+'\n')
def metrics(es):
 w=sum(e['result']=='win' for e in es);l=sum(e['result']=='loss' for e in es);run=streak=0
 for e in es:
  if e['result']=='loss':run+=1;streak=max(streak,run)
  elif e['result']=='win':run=0
 return {'win':w,'loss':l,'tie':sum(e['result']=='tie' for e in es),'winRate':w/(w+l) if w+l else None,'netAt86Percent':w*.86-l,'maxLossStreak':streak}
results=[]
for s in read('research/expiry-endpoint-screen-input-20261019.json')['screen']:
 out=[];changes=available=0
 for e in s['entries']:
  features=e['features'];side=e['side'];p=None
  if features is not None:
   available+=1;p=float(m.predict_proba(np.array([features])/scale)[0,1]);side='CALL' if p>=.5 else 'PUT'
  flip=side!=e['side'];changes+=flip
  result=('loss' if e['result']=='win' else 'win' if e['result']=='loss' else e['result']) if flip else e['result']
  out.append({**e,'side':side,'result':result,'p':p})
 results.append({'set':s['set'],'name':s['name'],'baseline':metrics(s['entries']),'candidate':metrics(out),'available':available,'changed':changes,'entries':out})
summary={}
for name in ['forex','crypto-screen']:
 rs=[r for r in results if r['set']==name];base=[e for s in read('research/expiry-endpoint-screen-input-20261019.json')['screen'] if s['set']==name for e in s['entries']];cand=[e for r in rs for e in r['entries']]
 b,c=metrics(base),metrics(cand);b['maxLossStreak']=max(r['baseline']['maxLossStreak'] for r in rs);c['maxLossStreak']=max(r['candidate']['maxLossStreak'] for r in rs)
 passed=c['winRate']>b['winRate'] and c['netAt86Percent']>0 and c['maxLossStreak']<=b['maxLossStreak']
 summary[name]={'baseline':b,'candidate':c,'passed':bool(passed),'improvedWindows':sum(r['candidate']['winRate']>r['baseline']['winRate'] for r in rs if r['baseline']['winRate'] is not None),'worsenedWindows':sum(r['candidate']['winRate']<r['baseline']['winRate'] for r in rs if r['baseline']['winRate'] is not None),'available':sum(r['available'] for r in rs),'changed':sum(r['changed'] for r in rs)}
report={'method':'Fixed development screen, not unseen validation or live OTC','summary':summary,'developmentPassed':all(s['passed'] for s in summary.values()),'results':results}
(R/'reports/sentinel-expiry-endpoint-screen-20261019.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'summary':summary,'developmentPassed':report['developmentPassed']},indent=2))
