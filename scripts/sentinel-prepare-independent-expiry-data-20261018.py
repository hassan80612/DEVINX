"""Prepare the preregistered, independent-day inputs without running a model."""
import base64, concurrent.futures, datetime as dt, hashlib, json, lzma, pathlib, struct, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'tests/fixtures/external'
CACHE=OUT/'independent-cache';CACHE.mkdir(parents=True,exist_ok=True)
UTC=dt.timezone.utc
spec=json.loads((ROOT/'reports/independent-expiry-preregistration-20261018.json').read_text())
def decode(raw,hour):
 data=lzma.decompress(raw);assert len(data)%20==0
 base=int(hour.timestamp()*1000);rows=[]
 for ms,ask,bid,av,bv in struct.iter_unpack('>IIIff',data):
  assert 0<=ms<3600000 and ask>=bid>0
  rows.append({'ts':base+ms,'price':bid/100000,'receivedAt':base+ms})
 return rows
# Cross-check decoding against a previously hash-checked source archive AND
# matching published external-fixture bids. No new outcome is inspected.
ref=base64.b64decode((OUT/'official-cache/2020-03-30-12.bi5.base64').read_text())
assert hashlib.sha256(ref).hexdigest()=='64e50aa88c8c2cade33b87c60f69f491d03e7d5bed5e15460e81f96f25ef5480'
rows=decode(ref,dt.datetime(2020,3,30,12,tzinfo=UTC))
known={q['ts']:q['price'] for q in json.loads((OUT/'dukascopy-eurusd-third-validation-12-utc.json').read_text())['quotes']}
matched=0
for q in rows:
 if q['ts'] in known:assert q['price']==known[q['ts']];matched+=1
assert matched>1000
def fetch(hour):
 name=hour.strftime('%Y-%m-%d-%H');url=f'https://datafeed.dukascopy.com/datafeed/EURUSD/{hour.year}/{hour.month-1:02d}/{hour.day:02d}/{hour.hour:02d}h_ticks.bi5'
 try:
  path=CACHE/(name+'.bi5')
  if path.exists():raw=path.read_bytes()
  else:
   with urllib.request.urlopen(url,timeout=18) as response:raw=response.read()
   decode(raw,hour);path.write_bytes(raw)
  rows=decode(raw,hour)
  return name,rows,{'name':name,'url':url,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'ticks':len(rows)}
 except Exception as error:return name,None,{'name':name,'url':url,'error':str(error)}
hours=[dt.datetime.fromisoformat(day).replace(hour=hour,tzinfo=UTC) for day in spec['newValidation']['days'] for hour in [12,13,14]]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:fetched=list(pool.map(fetch,hours))
provenance={'decoderMatchedBids':matched,'archives':[r[2] for r in fetched],'windows':[]}
for day in spec['newValidation']['days']:
 selected=[row for name,rows,_ in fetched if name.startswith(day) and rows is not None for row in rows]
 if sum(rows is not None for name,rows,_ in fetched if name.startswith(day))!=3:
  provenance['windows'].append({'day':day,'unavailable':True});continue
 quotes=list({q['ts']:q for q in sorted(selected,key=lambda q:q['ts'])}.values())
 at=int(dt.datetime.fromisoformat(day).replace(hour=14,tzinfo=UTC).timestamp()*1000);end=at+1800000
 quotes=[q for q in quotes if at-6300000<=q['ts']<=end+31000];minutes={};targets={}
 for q in quotes:
  t=q['ts']//60000*60000
  if t not in minutes:minutes[t]={'from':t/1000,'to':t/1000+60,'open':q['price'],'close':q['price'],'high':q['price'],'low':q['price'],'receivedAt':t+60000}
  c=minutes[t];c['close']=q['price'];c['high']=max(c['high'],q['price']);c['low']=min(c['low'],q['price'])
  if at<=q['ts']<=end:targets[q['ts']//1000]=q
 name='independent-'+day+'-14-utc'
 assert quotes[0]['ts']<=at-6000000 and quotes[-1]['ts']>=end+30000 and len(targets)>1200
 data={'asset':'EUR/USD','metadata':{'name':name,'kind':'external-market-replay-not-user-session','date':day,'source':'Dukascopy official EURUSD BI5','priceSide':'bid','expiryQuotePolicy':'asof-complete-bid-stream','from':at,'to':end,'limitations':['External Forex, not broker OTC or user session.','Minute candles aggregate actual ticks.','Historical source timestamps model receive time; no live latency or orders.']},'quotes':quotes,'targets':list(targets.values()),'candles':[c for c in minutes.values() if at-6000000<=c['to']*1000<=end]}
 encoded=(json.dumps(data,separators=(',',':'))+'\n').encode();(OUT/('dukascopy-eurusd-'+name+'.json')).write_bytes(encoded)
 provenance['windows'].append({'name':name,'quotes':len(quotes),'targets':len(targets),'sha256':hashlib.sha256(encoded).hexdigest()})
(ROOT/'reports/independent-expiry-data-provenance-20261018.json').write_text(json.dumps(provenance,indent=2)+'\n')
print(json.dumps(provenance,indent=2),flush=True)
