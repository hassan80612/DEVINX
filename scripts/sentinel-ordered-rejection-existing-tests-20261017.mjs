import {mkdtempSync,mkdirSync,symlinkSync,copyFileSync,rmSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {orderedRejectionResearchRuntime} from '../experiments/ordered-rejection-research-runtime-20261017.mjs';
const source=fileURLToPath(new URL('../',import.meta.url)),c=await orderedRejectionResearchRuntime(),root=mkdtempSync(join(tmpdir(),'sentinel-ordered-suite-'));
const tests=['sentinel-multiscale-level-chain.test.mjs','sentinel-observed-level-sequence.test.mjs','sentinel-13931-historical-structure.test.mjs','sentinel-13931-selected-forecast-structure.test.mjs'];
let status=1;
try{
 for(const path of ['tests','sentinel-trading-lab/agent/src'])mkdirSync(join(root,path),{recursive:true});
 symlinkSync(c.corePath,join(root,'sentinel-trading-lab/agent/src/core'));
 for(const path of ['sentinel-trading-lab/agent/worker','sentinel-trading-lab/agent/release.json','sentinel-trading-lab/agent/package.json','sentinel-trading-lab/agent/package-lock.json','sentinel-trading-lab/src','sentinel-trading-lab/public','sentinel-trading-lab/scripts','tests/fixtures'])symlinkSync(join(source,path),join(root,path));
 for(const name of tests)copyFileSync(join(source,'tests',name),join(root,'tests',name));
 const result=spawnSync(process.execPath,['--test',...tests.map(name=>'tests/'+name)],{cwd:root,encoding:'utf8'});
 status=result.status??1;
 const report={productionCommit:'a6e810400ecf1d909293d80818aa6282f5e81569',candidate:'ordered-rejection-research-only',tests,status,output:result.stdout+result.stderr};
 writeFileSync(join(source,'reports/sentinel-ordered-rejection-existing-tests-20261017.json'),JSON.stringify(report,null,2)+'\n');
 console.log(report.output);
}finally{c.cleanup();rmSync(root,{recursive:true,force:true});}
process.exitCode=status;
