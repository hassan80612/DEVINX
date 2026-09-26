import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const PUBLIC_SURFACES=[
  'src/components/HomeHub.tsx',
  'src/components/FinanceLanding.tsx',
  'src/components/FinanceHub.tsx'
];

test('Laser Control stays absent from public DevinX navigation',async()=>{
  for(const path of PUBLIC_SURFACES){
    const source=await readFile(path,'utf8');
    assert.equal(
      source.includes('/laser-control'),
      false,
      path+' must not expose Laser Control while it is master-only'
    );
  }
});

test('Laser Control page is server-gated to master',async()=>{
  const source=await readFile('src/app/laser-control/page.tsx','utf8');
  assert.match(source,/getLaserControlMasterSession/);
  assert.match(source,/if\(!session\)notFound\(\)/);
  assert.match(source,/index:false/);
});

test('Remote command dispatch remains hard-disabled in foundation',async()=>{
  const source=await readFile('src/features/laser-control/protocol.ts','utf8');
  assert.match(source,/LASER_REMOTE_COMMANDS_ENABLED=false/);
});


test('master surface is always server-gated by authenticated admin access',async()=>{
  const source=await readFile('src/features/laser-control/server/master.ts','utf8');
  assert.match(source,/get_devinx_access_status/);
  assert.match(source,/access\?\.is_admin/);
  assert.doesNotMatch(source,/VERCEL_ENV/);
});

test('Laser Control is linked only inside AdminMaster',async()=>{
  const source=await readFile('src/components/AdminMaster.tsx','utf8');
  assert.match(source,/LaserControlMasterPanel/);
  assert.match(source,/LASER CONTROL/);
});
