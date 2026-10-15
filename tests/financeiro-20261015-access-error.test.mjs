import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=path=>readFileSync(path,'utf8');
test('Financeiro distinguishes upstream errors from a genuinely expired plan',()=>{
  const page=file('src/app/painel/page.tsx');
  assert.match(page,/if\(accessError\|\|!access\)/);
  assert.match(page,/if\(!access\.allowed\)redirect\('\/entrar\?acesso=expirado'\)/);
  assert.match(page,/Financeiro temporariamente indisponível/);
});
test('middleware does not log out valid clients or mark their subscription expired on quota outages',()=>{
  const c=file('src/middleware.ts');
  assert.match(c,/exceed_egress_quota/);
  assert.match(c,/transientAuthError/);
  assert.match(c,/status:503/);
  assert.match(c,/if\(accessError\|\|!access\)/);
});
test('login shows a real upstream quota/service problem, and never downgrades to wrong password',()=>{
  const c=file('src/app/entrar/AuthForm.tsx');
  assert.match(c,/exceed_egress_quota/);
  assert.match(c,/Seu acesso não foi cancelado/);
  assert.match(c,/friendlyError\(String\(e\?\.message/);
  const page=file('src/app/entrar/page.tsx');
  assert.match(page,/if\(accessError\|\|!access\)/);
});
