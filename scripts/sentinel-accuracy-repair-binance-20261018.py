import pathlib,json,urllib.request,zipfile,io,csv,datetime as dt,concurrent.futures,hashlib,math
R=pathlib.Path(__file__).resolve().parents[1];C=R.parent/'research-data'/'accuracy-repair-binance-20261018';C.mkdir(parents=True,exist_ok=True)
spec=json.loads((R/'reports/sentinel-accuracy-repair-spec-20261018.json').read_text())['alternativeRegisteredBeforeOutcomes'];UTC=dt.timezone.utc

def get(item):
 day,asset=item;name=f'{asset}-1s-{day}.zip';u=f'https://data.binance.vision/data/spot/daily/klines/{asset}/1s/{name}';p=C/name
 if p.exists():raw=p.read_bytes()
 else:
  with urllib.request.urlopen(u,timeout=30) as f:raw=f.read()
  z=zipfile.ZipFile(io.BytesIO(raw));assert z.testzip() is None;p.write_bytes(raw)
 with urllib.request.urlopen(u+'.CHECKSUM',timeout=20) as f:checksum=f.read().decode().split()[0]
 assert hashlib.sha256(raw).hexdigest()==checksum
 at=int(dt.datetime.fromisoformat(day).replace(hour=15,tzinfo=UTC).timestamp()*1000);end=at+1800000;quotes=[];minutes={}
 z=zipfile.ZipFile(io.BytesIO(raw));rows=csv.reader(io.StringIO(z.read(z.namelist()[0]).decode()))
 total=0
 for row in rows:
  total+=1;start=int(row[0]);close=int(row[6]);div=1000 if start>10**14 else 1;start//=div;close//=div
  assert close-start==999
  if not at-6000000<=start<=end+60000:continue
  op,hi,lo,price=map(float,row[1:5]);assert 0<lo<=min(op,price)<=max(op,price)<=hi
  # A 1s OHLC close is available after that second completes; use boundary.
  timestamp=start+1000;quotes.append({'ts':timestamp,'price':price,'receivedAt':timestamp})
  minute=start//60000*60000
  if minute not in minutes:minutes[minute]={'from':minute/1000,'to':minute/1000+60,'open':op,'high':hi,'low':lo,'close':price,'receivedAt':minute+60000,'seconds':0}
  c=minutes[minute];c['high']=max(c['high'],hi);c['low']=min(c['low'],lo);c['close']=price;c['seconds']+=1
 candles=[{k:v for k,v in c.items() if k!='seconds'} for c in minutes.values() if c['seconds']==60]
 name=f'binance-{asset.lower()}-{day}-1500-utc';meta={'name':name,'kind':'previously-unscored-external-crypto-not-broker-OTC','source':u,'archiveSha256':checksum,'sourceRows':total,'expiryQuotePolicy':'first-after-within-1s','limitations':['Actual 1s OHLC closing prices at completion boundary, not bid tick prices.','No interpolation or intra-second assumed path; one evaluation per completed second.','Native OHLC minute bars aggregate complete 1s OHLC; delivered only after minute close.','Historical availability uses source boundaries; no broker transport, click, settlement or OTC modeled.']}
 d={'asset':asset,'metadata':meta,'quotes':quotes,'targets':[q for q in quotes if at<=q['ts']<=end],'candles':candles};assert len(d['targets'])==1801 and len(candles)>=130
 encoded=(json.dumps(d,separators=(',',':'))+'\n').encode();fixture=R/'tests/fixtures/external'/(name+'.json');fixture.write_bytes(encoded)
 return {'name':name,'asset':asset,'date':day,'url':u,'archiveSha256':checksum,'bytes':len(raw),'fixtureSha256':hashlib.sha256(encoded).hexdigest(),'sourceRows':total,'quotes':len(quotes),'targets':len(d['targets'])}
results=[];failures=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 futures={pool.submit(get,(day,asset)):(day,asset) for day in spec['dates'] for asset in spec['assets']}
 for f in concurrent.futures.as_completed(futures):
  try:r=f.result();results.append(r);print(json.dumps(r),flush=True)
  except Exception as e:day,asset=futures[f];failures.append({'date':day,'asset':asset,'error':str(e)});print('FAILED',day,asset,str(e),flush=True)
results.sort(key=lambda r:(r['date'],r['asset']));(R/'reports/sentinel-accuracy-repair-binance-data-20261018.json').write_text(json.dumps({'spec':spec,'windows':results,'failures':failures},indent=2)+'\n');print('complete',len(results),flush=True)
