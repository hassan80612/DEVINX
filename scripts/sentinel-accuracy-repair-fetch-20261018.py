import pathlib,datetime as dt,urllib.request,concurrent.futures,lzma,struct,json,hashlib,base64
R=pathlib.Path(__file__).resolve().parents[1];C=R.parent/'research-data'/'accuracy-repair-20261018';C.mkdir(parents=True,exist_ok=True)
UTC=dt.timezone.utc
spec=json.loads((R/'reports/sentinel-accuracy-repair-spec-20261018.json').read_text());windows=spec['unseenBeforeOutcomes']
hours=set()
for w in windows:
 start=dt.datetime.fromisoformat(w.split('/')[0].replace('Z','+00:00'));hours.add(start.replace(minute=0));hours.add((start-dt.timedelta(hours=1)).replace(minute=0))
def fetch(h):
 u=f'https://datafeed.dukascopy.com/datafeed/EURUSD/{h.year}/{h.month-1:02d}/{h.day:02d}/{h.hour:02d}h_ticks.bi5';p=C/(h.strftime('%Y-%m-%d-%H')+'.bi5')
 if p.exists():raw=p.read_bytes()
 else:
  with urllib.request.urlopen(u,timeout=20) as r:raw=r.read()
  lzma.decompress(raw);p.write_bytes(raw)
 decoded=lzma.decompress(raw);assert len(decoded)%20==0
 base=int(h.timestamp()*1000);rows=[]
 for ms,ask,bid,av,bv in struct.iter_unpack('>IIIff',decoded):
  assert 0<=ms<3600000 and ask>=bid>0
  rows.append({'ts':base+ms,'price':bid/100000,'receivedAt':base+ms})
 return h,rows,{'url':u,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'ticks':len(rows),'cache':p.name}
fetched={};failures=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 futures={pool.submit(fetch,h):h for h in sorted(hours)}
 for f in concurrent.futures.as_completed(futures):
  h=futures[f]
  try:
   _,rows,meta=f.result();fetched[h]=(rows,meta);print(json.dumps(meta),flush=True)
  except Exception as e:failures.append({'hour':h.isoformat(),'error':str(e)});print('fetch_failed',h.isoformat(),str(e),flush=True)
provenance={'spec':spec,'archives':[v[1] for v in fetched.values()],'failures':failures,'windows':[]}
for w in windows:
 start=dt.datetime.fromisoformat(w.split('/')[0].replace('Z','+00:00'));hs=[start.replace(minute=0),(start-dt.timedelta(hours=1)).replace(minute=0)]
 if not all(h in fetched for h in hs):continue
 at=int(start.timestamp()*1000);end=at+1800000;raw=sorted([q for h in hs for q in fetched[h][0]],key=lambda q:q['ts']);quotes=list({q['ts']:q for q in raw}.values());minutes={};buckets={}
 for q in quotes:
  minute=q['ts']//60000*60000
  if minute not in minutes:minutes[minute]={'from':minute/1000,'to':minute/1000+60,'open':q['price'],'close':q['price'],'high':q['price'],'low':q['price'],'receivedAt':minute+60000}
  c=minutes[minute];c['close']=q['price'];c['high']=max(c['high'],q['price']);c['low']=min(c['low'],q['price'])
  if at<=q['ts']<=end:buckets[q['ts']//1000]=q
 name='accuracy-repair-'+start.strftime('%Y-%m-%d-%H%M')+'-utc';d={'asset':'EUR/USD','metadata':{'name':name,'kind':'previously-unscored-external-market-not-user-session','source':'Official Dukascopy EURUSD BI5','window':w,'expiryQuotePolicy':'asof-complete-bid-stream','archives':[fetched[h][1] for h in hs]},'quotes':quotes,'targets':list(buckets.values()),'candles':list(minutes.values())}
 assert quotes[-1]['ts']>=end+30000 and len(d['targets'])>1000 and len([c for c in d['candles'] if c['to']*1000<=at])>=80
 data=(json.dumps(d,separators=(',',':'))+'\n').encode();p=R/'tests/fixtures/external'/('dukascopy-eurusd-'+name+'.json');p.write_bytes(data);provenance['windows'].append({'name':name,'sha256':hashlib.sha256(data).hexdigest(),'quotes':len(quotes),'targets':len(buckets)})
(R/'reports/sentinel-accuracy-repair-data-20261018.json').write_text(json.dumps(provenance,indent=2)+'\n');print('complete_windows',len(provenance['windows']),flush=True)
