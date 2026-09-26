import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('public Laser Control surface is coming-soon only',async()=>{
  const source=await readFile('src/components/HomeHub.tsx','utf8');
  assert.match(source,/LASER_SOON/);
  assert.match(source,/styles\.laserSoon/);
  const laserBlock=source.slice(source.indexOf('<div className={styles.laserSoon}'),source.indexOf('</div>',source.indexOf('<div className={styles.laserSoon}'))+6);
  assert.doesNotMatch(laserBlock,/href=/);
  assert.doesNotMatch(laserBlock,/onClick=/);
});

test('real Laser Control panel is only mounted inside AdminMaster',async()=>{
  const admin=await readFile('src/components/AdminMaster.tsx','utf8');
  const finance=await readFile('src/components/FinanceHub.tsx','utf8');
  assert.match(admin,/LaserControlMasterPanel/);
  assert.match(admin,/LASER CONTROL/);
  assert.doesNotMatch(finance,/LaserControlMasterPanel/);
  assert.match(finance,/section==='master'&&access\.is_admin&&<AdminMaster\/>/);
});

test('Laser commands remain disabled in public-facing site integration',async()=>{
  const panel=await readFile('src/components/LaserControlMasterPanel.tsx','utf8');
  assert.match(panel,/Comandos remotos continuam desligados/);
  assert.doesNotMatch(panel,/laser-agent-command/);
});
