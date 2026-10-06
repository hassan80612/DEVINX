import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('the actual Worker sends live quote timestamps and controls to the browser card',async()=>{
 const fixture=fileURLToPath(new URL('./worker-pipeline.fixture.mjs',import.meta.url));
 const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fixture],{env:process.env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const timer=setTimeout(()=>{child.kill();reject(new Error('Worker pipeline timed out: '+output))},25000);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);resolve({code,output})})});assert.equal(result.code,0,result.output);assert.match(result.output,/WORKER → LIVE SNAPSHOT → REAL OVERLAY: PASS/);
});
