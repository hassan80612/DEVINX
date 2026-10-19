"""Diagnostic transcription only. Never feed unverified OCR into production.
Input: a directory of one-second right-axis crops (240x780) from the video.
Private user frames and their derived JSON stay outside the public repository.
"""
import pathlib,sys,re,json,subprocess,concurrent.futures,os,numpy as np
os.environ['OMP_THREAD_LIMIT']='1'
from PIL import Image,ImageOps
root=pathlib.Path(sys.argv[1]);output=pathlib.Path(sys.argv[2])
def read(path):
 a=np.array(Image.open(path).convert('RGB'));r,g,b=[a[:,:,i].astype(int) for i in range(3)]
 sat=((g>110)&(g>r*1.6)&(g>b*1.2))|((r>110)&(r>g*1.6)&(r>b*1.2))
 sat[:,:130]=False;sat[:,235:]=False
 rows=np.flatnonzero(sat.sum(axis=1)>2);groups=[]
 for y in rows:
  if not groups or y-groups[-1][-1]>5:groups.append([int(y)])
  else:groups[-1].append(int(y))
 groups=[s for s in groups if 7<=s[-1]-s[0]<=45]
 if not groups:return {'frame':path.name,'error':'colored quote digits absent'}
 ys=max(groups,key=lambda s:int(sat[s[0]:s[-1]+1].sum()));y0=max(0,ys[0]-8);y1=min(a.shape[0],ys[-1]+9)
 crop=np.max(a[y0:y1,70:235],axis=2)>110;im=Image.fromarray(np.uint8(~crop)*255).resize((495,(y1-y0)*3))
 text=subprocess.check_output(['tesseract','stdin','stdout','--psm','7','-c','tessedit_char_whitelist=0123456789.'],input=im_bytes(im),stderr=subprocess.DEVNULL).decode().strip()
 s=re.sub(r'[^0-9.]','',text);matches=re.findall(r'0\.85\d{4}(?!\d)',s);price=float(matches[0]) if len(matches)==1 else None
 return {'frame':path.name,'videoSecond':int(path.stem.split('-')[-1])-0.5,'price':price,'raw':text,'cropY':[y0,y1]}
def im_bytes(im):
 import io
 out=io.BytesIO();im.save(out,format='PNG');return out.getvalue()
existing=json.loads(output.read_text()) if '--retry-missing' in sys.argv and output.exists() else None
prior={q['frame']:q for q in existing['quotes']} if existing else {}
paths=sorted(p for p in root.glob('price-*.png') if not prior or prior[p.name].get('price') is None)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 rows=[]
 for i,r in enumerate(pool.map(read,paths)):
  rows.append(r)
  if i%100==0:print(json.dumps({'processed':i+1}),flush=True)
if prior:
 for row in rows:
  if row.get('price') is not None:row['rawInitial']=prior[row['frame']].get('raw');row['retryCrop']=True;prior[row['frame']]=row
 rows=sorted(prior.values(),key=lambda q:q['frame'])
output.write_text(json.dumps({'method':'OCR approximate sample at second midpoint; no interpolation or broker timestamp guarantee','quotes':rows},indent=2)+'\n')
print(json.dumps({'frames':len(rows),'valid':sum(r.get('price') is not None for r in rows),'missing':sum(r.get('price') is None for r in rows)}))
