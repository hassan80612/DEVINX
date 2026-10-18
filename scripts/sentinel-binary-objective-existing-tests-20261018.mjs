import {mkdtempSync,mkdirSync,symlinkSync,copyFileSync,rmSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {binaryObjectiveResearchRuntime} from '../experiments/binary-objective-research-runtime-20261018.mjs';
const source=fileURLToPath(new URL('../',import.meta.url));
const c=await binaryObjectiveResearchRuntime({expiryScoring:'asof'}),root=mkdtempSync(join(tmpdir(),'sentinel-objective-suite-'));
const tests=['sentinel-video-consistency-20261016.test.mjs','sentinel-shared-base-v2.test.mjs',
 'sentinel-fast-feed-history.test.mjs','sentinel-13936-observed-sampling.test.mjs',
 'sentinel-13929-adaptive-expiry.test.mjs','sentinel-now-expiry-one-shot.test.mjs',
 'sentinel-13931-historical-structure.test.mjs','sentinel-13931-selected-forecast-structure.test.mjs',
 'sentinel-observed-level-sequence.test.mjs','sentinel-multiscale-level-chain.test.mjs'];
let status=1;
try{
 for(const path of ['tests','sentinel-trading-lab/agent/src'])mkdirSync(join(root,path),{recursive:true});
 symlinkSync(c.corePath,join(root,'sentinel-trading-lab/agent/src/core'));
 for(const path of ['scripts','research','tests/fixtures','sentinel-trading-lab/agent/worker',
  'sentinel-trading-lab/agent/release.json','sentinel-trading-lab/agent/package.json',
  'sentinel-trading-lab/agent/package-lock.json','sentinel-trading-lab/src',
  'sentinel-trading-lab/public','sentinel-trading-lab/scripts'])symlinkSync(join(source,path),join(root,path));
 for(const name of tests)copyFileSync(join(source,'tests',name),join(root,'tests',name));
 const result=spawnSync(process.execPath,['--test','--test-concurrency=1',...tests.map(name=>'tests/'+name)],{cwd:root,encoding:'utf8'});
 status=result.status??1;
 const report={productionReference:'a6e810400ecf1d909293d80818aa6282f5e81569',
  candidate:'binary-objective-plus-asof-expiry-research-only',tests,status,output:result.stdout+result.stderr};
 writeFileSync(join(source,'reports/sentinel-binary-objective-existing-tests-20261018.json'),JSON.stringify(report,null,2)+'\n');
 console.log(report.output);
}finally{c.cleanup();rmSync(root,{recursive:true,force:true});}
process.exitCode=status;
