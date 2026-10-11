"""Offline only. Real 1s Binance BTC/ETH OHLCV + taker-buy-flow benchmark.
Train: 2026-10-08 first 65%; calibration: remainder of 2026-10-08;
sealed final evaluation: 2026-10-09. NO IQ Option claims.
"""
import json
import os
from pathlib import Path
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

ROOT=Path(os.environ.get("SENTINEL_RESEARCH_MARKET_DIR","tmp/sentinel-market-1s"))
ASSETS=("BTCUSDT","ETHUSDT")
DAY_TRAIN="2026-10-08"
DAY_FINAL="2026-10-09"
HORIZONS=(30,60,180)
EPS=1e-10

def rsum(a,w):
    c=np.r_[0.,np.cumsum(a)]
    t=np.arange(len(a))
    return c[t+1]-c[np.maximum(0,t+1-w)]

def shift(a,w):
    t=np.arange(len(a))
    return a[np.maximum(0,t-w)]

def load_features(asset,date):
    fn=ROOT/(asset+"-1s-"+date+".csv")
    data=np.loadtxt(fn,delimiter=",",usecols=(0,1,2,3,4,5,9))
    assert data.shape[0]>80000,(fn,data.shape)
    t=data[:,0].astype(np.float64)
    if t[0]>1e15:t=t/1000
    assert np.mean(np.diff(t)==1000)>.99,(fn,"gap rate")
    price=data[:,4]
    high=data[:,2]
    low=data[:,3]
    vol=np.maximum(0,data[:,5])
    take=np.maximum(0,data[:,6])
    logp=np.log(price)
    r=np.diff(logp,prepend=logp[0])
    sigma30=np.sqrt(np.maximum(rsum(r*r,30)/30,1e-15))
    sigma180=np.sqrt(np.maximum(rsum(r*r,180)/180,1e-15))
    sigma600=np.sqrt(np.maximum(rsum(r*r,600)/600,1e-15))
    features=[]
    for w in (3,5,10,20,30,60,120,180,300,600):
        m=logp-shift(logp,w)
        features.append(np.clip(m/(sigma180*np.sqrt(w)+EPS),-12,12))
    for w in (5,15,30,60,180,600):
        net=2*rsum(take,w)/(rsum(vol,w)+EPS)-1
        features.append(np.clip(net,-1,1))
        relative_volume=np.log1p(rsum(vol,w)/w)-np.log1p(rsum(vol,600)/600)
        features.append(np.clip(relative_volume,-10,10))
    for w in (30,180,600):
        avg=rsum(logp,w)/np.minimum(w,np.arange(len(logp))+1)
        features.append(np.clip((logp-avg)/(sigma180*np.sqrt(w)+EPS),-12,12))
    features.extend([
       np.clip(np.log((sigma30+EPS)/(sigma180+EPS)),-4,4),
       np.clip(np.log((sigma180+EPS)/(sigma600+EPS)),-4,4),
       np.clip(sigma180*10000,0,25),
       np.clip((high-low)/price*10000,0,25),
       np.clip((price-low)/(high-low+EPS)-.5,-.5,.5),
       np.clip((rsum(np.maximum(r,0),30)-rsum(np.maximum(-r,0),30))/
            (rsum(np.abs(r),30)+EPS),-1,1)
    ])
    arr=np.column_stack(features).astype("float32")
    assert arr.shape==(len(price),len(features))
    assert np.isfinite(arr).all()
    return arr,price,t

def wilson(w,n):
    if not n:return None
    z=1.96
    p=w/n
    den=1+z*z/n
    c=(p+z*z/(2*n))/den
    m=z*np.sqrt(p*(1-p)/n+z*z/(4*n*n))/den
    return [round(100*(c-m),2),round(100*(c+m),2)]

def measure(proba,y,threshold):
    conf=np.maximum(proba,1-proba)
    mask=conf>=threshold
    total=len(y)
    selected=int(mask.sum())
    pred=proba>=.5
    hits=int(np.count_nonzero(pred[mask]==y[mask]))
    return dict(opportunities=total,signals=selected,
      coveragePct=round(selected/total*100,2),accuracyPct=round(hits/selected*100,2) if selected else None,
      ci95Pct=wilson(hits,selected))

streams={}
for d in (DAY_TRAIN,DAY_FINAL):
    for a in ASSETS:streams[(a,d)]=load_features(a,d)

print("REAL_PRICE_DATA_SOURCES="+json.dumps({str(k):len(v[1]) for k,v in streams.items()}),flush=True)
for h in HORIZONS:
    Xtr,Ytr,Xcal,Ycal,Xtest,Ytest=[],[],[],[],[],[]
    testgroups=[]
    for asset in ASSETS:
        x,p,_=streams[(asset,DAY_TRAIN)]
        cut=int(len(p)*.65)
        idxtr=np.arange(1200,cut-h,12)
        idxcal=np.arange(cut+1200,len(p)-h,300)
        Xtr.append(x[idxtr]);Ytr.append((p[idxtr+h]>p[idxtr]).astype(int))
        Xcal.append(x[idxcal]);Ycal.append((p[idxcal+h]>p[idxcal]).astype(int))
        x2,p2,_=streams[(asset,DAY_FINAL)]
        idxt=np.arange(3000,len(p2)-h-5,600)
        Xtest.append(x2[idxt]);Ytest.append((p2[idxt+h]>p2[idxt]).astype(int))
        testgroups.append((asset,len(idxt)))
    Xtr=np.concatenate(Xtr);Ytr=np.concatenate(Ytr)
    Xcal=np.concatenate(Xcal);Ycal=np.concatenate(Ycal)
    Xtest=np.concatenate(Xtest);Ytest=np.concatenate(Ytest)
    experiments={
       'histgradient':HistGradientBoostingClassifier(max_iter=100,max_depth=3,learning_rate=.04,
                    max_leaf_nodes=9,min_samples_leaf=90,l2_regularization=5,random_state=67),
       'logistic':make_pipeline(StandardScaler(),
                    LogisticRegression(C=.08,max_iter=300,random_state=67))
    }
    candidates=[]
    for name,model in experiments.items():
        model.fit(Xtr,Ytr)
        cal=model.predict_proba(Xcal)[:,1]
        final=model.predict_proba(Xtest)[:,1]
        candidates.append(dict(
         algorithm=name,trainingSamples=len(Ytr),calibrationSamples=len(Ycal),finalSamples=len(Ytest),
         calibration={str(t):measure(cal,Ycal,t) for t in (.5,.6,.65,.7,.75,.8,.85,.9)},
         untouchedFinal={str(t):measure(final,Ytest,t) for t in (.5,.6,.65,.7,.75,.8,.85,.9)},
         byAsset={asset:{str(t):measure(final[sum(n for _,n in testgroups[:j]):sum(n for _,n in testgroups[:j+1])],
            Ytest[sum(n for _,n in testgroups[:j]):sum(n for _,n in testgroups[:j+1])],t)
              for t in (.5,.7,.8)}
                for j,(asset,count) in enumerate(testgroups)}
        ))
    print("SENTINEL_OFFLINE_REAL_FLOW_ML="+json.dumps({
       'horizonSeconds':h,'source':'REAL Binance spot 1s OHLCV and taker buy volume',
       'train':DAY_TRAIN,'finalUnseen':DAY_FINAL,'userOTC':False,
       'features':'price slopes volatility range position trade volume taker buy flow',
       'models':candidates}),flush=True)
