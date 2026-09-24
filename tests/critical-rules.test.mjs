import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(path)=>readFileSync(path,"utf8");

test("middleware mantém páginas públicas rápidas e protege acesso do onboarding",()=>{
  const source=read("src/middleware.ts");
  assert.match(source,/if\(!isProtected\)return NextResponse\.next/);
  assert.match(source,/pathname==='\/onboarding'/);
  assert.match(source,/rpc\('get_devinx_access_status'\)/);
  const publicFastPath=source.indexOf("if(!isProtected)return NextResponse.next");
  const accessRpc=source.indexOf("rpc('get_devinx_access_status')");
  assert.ok(publicFastPath>=0&&accessRpc>publicFastPath);
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


test("plano da DevinX Loja entra na ponte direta de checkout",()=>{
  const source=read("src/app/loja/assinar/[plan]/page.tsx");
  assert.ok(source.includes("https://www.vetorizeai.com.br/minha-loja/assinar/"));
  assert.equal(source.includes("?assinar="),false);
  assert.equal(source.includes("#planos"),false);
});


test("idioma do Financeiro é inicializado uma vez e não sobrescreve escolha do usuário",()=>{
  const source=read("src/components/FinanceHub.tsx");
  assert.ok(source.includes("initialPreferencesApplied=useRef(false)"));
  assert.ok(source.includes("if(initialPreferencesApplied.current)return"));
  assert.ok(source.includes("initialPreferencesApplied.current=true"));
});
