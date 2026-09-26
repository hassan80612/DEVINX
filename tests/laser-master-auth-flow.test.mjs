import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('laser-control receives the same SSR auth refresh as painel',async()=>{
  const source=await readFile('src/middleware.ts','utf8');
  assert.match(source,/protectedPrefixes=\[[^\]]*'\/painel'[^\]]*'\/laser-control'/);
});

test('already authenticated login flow respects laser-control next path',async()=>{
  const source=await readFile('src/app/entrar/page.tsx','utf8');
  assert.match(source,/const nextPath=safePath\(params\.next\)/);
  assert.match(source,/if\(access\?\.allowed\)redirect\(nextPath\|\|'\/painel'\)/);
  assert.match(source,/AuthForm nextPath=\{nextPath\}/);
});
