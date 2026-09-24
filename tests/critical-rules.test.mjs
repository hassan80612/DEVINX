import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(path)=>readFileSync(path,"utf8");

test("middleware protege sessão sem consultar assinatura em páginas públicas",()=>{
  const source=read("src/middleware.ts");
  assert.match(source,/if\(!isProtected\)return NextResponse\.next/);
  assert.doesNotMatch(source,/get_devinx_access_status/);
});

test("painel resolve acesso e preferências no servidor uma única vez",()=>{
  const page=read("src/app/painel/page.tsx");
  const hub=read("src/components/FinanceHub.tsx");
  assert.match(page,/rpc\('get_devinx_access_status'\)/);
  assert.match(page,/select\('onboarded_at,locale,currency_code,timezone'\)/);
  assert.match(page,/initialAccess=\{access\}/);
  assert.doesNotMatch(hub,/auth\.getUser\(/);
  assert.doesNotMatch(hub,/rpc\('get_devinx_access_status'\)/);
});

test("dashboard não repete consultas apenas para calcular caixa",()=>{
  const source=read("src/components/DashboardOverview.tsx");
  const load=source.slice(source.indexOf("async function load("),source.indexOf("async function loadFlowData("));
  assert.equal((load.match(/from\('transactions'\)/g)||[]).length,1);
  assert.equal((load.match(/from\('work_sessions'\)/g)||[]).length,1);
  assert.equal((load.match(/from\('recurring_bill_payments'\)/g)||[]).length,1);
  assert.equal((load.match(/from\('card_bill_payments'\)/g)||[]).length,1);
});

test("home e loja não escondem todo conteúdo até o primeiro useEffect",()=>{
  const home=read("src/components/HomeHub.tsx");
  const gate=read("src/components/StoreAvailabilityGate.tsx");
  assert.doesNotMatch(home,/if\(!mounted\)/);
  assert.doesNotMatch(gate,/if\(!ready\)/);
});

test("vitrine diferencia inexistência de falha temporária do backend",()=>{
  const page=read("src/app/[storeSlug]/page.tsx");
  const backend=read("src/lib/storefront-backend.ts");
  assert.doesNotMatch(page,/fetchPublicStorefront\(storeSlug\)\.catch\(\(\)=>null\)/);
  assert.match(backend,/revalidate:\s*30/);
  assert.match(backend,/AbortSignal\.timeout\(8_000\)/);
});
