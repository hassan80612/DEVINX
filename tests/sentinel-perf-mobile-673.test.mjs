import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=async path=>readFile(new URL('../sentinel-trading-lab/'+path,import.meta.url),'utf8');

test('PC overlay rebuilds complete status only on visible due frame or a changed operational state',async()=>{
  const source=await read('agent/worker/index.mjs');
  assert.match(source,/await runtime\.tick\(loopNow,\{skipStatus:true\}\)/);
  assert.match(source,/const overlayFastKey=\[/);
  assert.match(source,/if\(overlayFastKey!==lastOverlayProbeKey\|\|Date\.now\(\)-lastOverlayAt>=1000\)\{/);
  const guard=source.indexOf('if(overlayFastKey!==lastOverlayProbeKey');
  const status=source.indexOf('const view=await runtime.status();',guard);
  const publish=source.indexOf('overlayUpdates.publish(activeProvider',status);
  assert.ok(guard>0&&status>guard&&publish>status,'the heavyweight call must stay behind the overlay gate');
  assert.match(source,/const urgentOverlay=overlayTimingKey!==lastOverlayTimingKey/);
  assert.match(source,/const realtimeQuotes=new LatestQuoteScheduler/);
});

test('mobile websocket resumes quickly without duplicate open sockets',async()=>{
  const source=await read('src/lib/signed-live-analyst-channel.ts');
  assert.match(source,/Math\.min\(9000,1500\*2\*\*Math\.min\(4,attempt\+\+\)\)/);
  assert.match(source,/if\(closed\|\|ws\)return/);
  assert.match(source,/if\(!ws\)\{\s*if\(retry\)\{clearTimeout\(retry\);retry=null\}\s*connect\(\)/);
  assert.match(source,/document\.addEventListener\('visibilitychange',visibility\)/);
  assert.match(source,/crypto\.subtle\.verify\('HMAC'/);
});

test('old/reordered mobile packets cannot block the status recovery path',async()=>{
  const source=await read('src/app/console/page.tsx');
  assert.match(source,/\(streaming\?45000:6000\)/);
  const reject=source.indexOf('if(nextEval<prevEval)return previous;');
  const confirmed=source.indexOf('liveFrameAt.current=Date.now();',reject);
  assert.ok(reject>=0&&confirmed>reject);
  assert.match(source,/if\(Number\(payload\.liveBroker\?\.lastQuoteAt\|\|0\)<prevPriceAt-250\)return previous/);
});

test('hidden mobile card stops clock updates without modifying prediction math',async()=>{
  const source=await read('src/components/LiveScenarioCard.tsx');
  assert.match(source,/document\.visibilityState==='visible'/);
  assert.match(source,/clearInterval\(timer\)/);
  assert.match(source,/document\.removeEventListener\('visibilitychange',syncVisibility\)/);
  assert.match(source,/liveCardModel\(s,now,averageThreshold\)/);
});
