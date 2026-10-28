import test from 'node:test';
import assert from 'node:assert/strict';
import {precisionEntryGate} from '../sentinel-trading-lab/agent/src/core/precision-entry-policy.mjs';

const base={quoteAt:100_000,now:100_200};
const reversalProbability={pCall:.66,pPut:.34,side:'CALL',trendSide:'PUT',fastSide:'CALL',fastReversalAgainst30s:true};

test('v47 permite 30s em reversão local confirmada sem exigir extremo de faixa',()=>{
 const result=precisionEntryGate({...base,durationMs:30_000,
  original:{side:'PUT'},preliminary:reversalProbability,
  candidate:{ready:true,side:'CALL',reason:'closed-range-extreme-reversal-confirmed',position:.5,observedSwingSeconds:45}});
 assert.equal(result.ready,true);
 assert.equal(result.score,100);
 assert.equal(result.extremeRequired,false);
});

test('v47 bloqueia 1m sem previsão contrária e sem reversão confirmada',()=>{
 const result=precisionEntryGate({...base,durationMs:60_000,
  original:{side:'CALL'},preliminary:{...reversalProbability,pCall:.58,side:null},
  candidate:{ready:true,side:'PUT',reason:'break-retest-continuation',position:.8,observedSwingSeconds:40}});
 assert.equal(result.ready,false);
 assert.equal(result.reason,'precision-reversal-required');
});

test('v47 exige extremo para 5m, mesmo com índices fortes',()=>{
 const result=precisionEntryGate({...base,durationMs:300_000,
  original:{side:'CALL'},preliminary:{pCall:.34,pPut:.66,side:'PUT',trendSide:'CALL',fastSide:'PUT',fastReversalAgainst30s:true},
  candidate:{ready:true,side:'PUT',reason:'confirmed-level-structure-reversal',position:.5,
   priceStructure:{confirmedReversal:{kind:'confirmed-level-structure-reversal',level:{confirmedPivots:2,independentRejections:2}}}}});
 assert.equal(result.ready,false);
 assert.equal(result.reason,'precision-extreme-required');
});

test('v47 admite 5m no extremo quando o nível extremo tem rejeições independentes',()=>{
 const result=precisionEntryGate({...base,durationMs:300_000,
  original:{side:'CALL'},preliminary:{pCall:.34,pPut:.66,side:'PUT',trendSide:'CALL',fastSide:'PUT',fastReversalAgainst30s:true},
  candidate:{ready:true,side:'PUT',reason:'confirmed-level-structure-reversal',
   position:.8,priceStructure:{confirmedReversal:{kind:'confirmed-level-structure-reversal',level:{confirmedPivots:2,independentRejections:2}}}}});
 assert.equal(result.ready,true);
 assert.equal(result.score,100);
});
