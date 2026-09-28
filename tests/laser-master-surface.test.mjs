import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('public Laser Control surface exposes the product card and its own landing page',async()=>{
  const home=await readFile('src/components/HomeHub.tsx','utf8');
  const card=await readFile('src/components/LaserHomeCard.tsx','utf8');
  const landing=await readFile('src/components/LaserLanding.tsx','utf8');
  assert.match(home,/LaserHomeCard/);
  assert.match(card,/href="\/laser-control\/conhecer"/);
  assert.match(card,/Conhecer Laser Control/);
  assert.match(landing,/DEVINX LASER CONTROL/);
  assert.match(landing,/id="planos"/);
});

test('Laser public pages own their canonical and social metadata',async()=>{
  const landing=await readFile('src/app/laser-control/conhecer/page.tsx','utf8');
  const guide=await readFile('src/app/laser-control/guia/page.tsx','utf8');
  const mentor=await readFile('src/app/laser-control/mentoria/page.tsx','utf8');
  assert.match(landing,/laser-control\/conhecer/);
  assert.match(landing,/openGraph/);
  assert.match(landing,/twitter/);
  assert.match(guide,/laser-control\/guia/);
  assert.match(mentor,/laser-control\/mentoria/);
  assert.match(mentor,/robots:\{index:false,follow:false,nocache:true\}/);
});

test('real Laser Control panel is mounted in AdminMaster and in the entitlement-gated Laser route',async()=>{
  const admin=await readFile('src/components/AdminMaster.tsx','utf8');
  const finance=await readFile('src/components/FinanceHub.tsx','utf8');
  const route=await readFile('src/app/laser-control/page.tsx','utf8');
  assert.match(admin,/LaserControlMasterPanel/);
  assert.match(admin,/LASER CONTROL/);
  assert.doesNotMatch(finance,/LaserControlMasterPanel/);
  assert.match(finance,/section==='master'&&access\.is_admin&&<AdminMaster\/>/);
  assert.match(route,/LaserControlWorkspace/);
  assert.match(route,/getLaserControlAccess/);
});

test('Laser commands remain disabled in legacy public-facing master integration',async()=>{
  const panel=await readFile('src/components/LaserControlMasterPanel.tsx','utf8');
  assert.match(panel,/Comandos remotos continuam desligados/);
  assert.doesNotMatch(panel,/laser-agent-command/);
});


test('Laser public landing has real copy for supported languages',async()=>{
  const landing=await readFile('src/components/LaserLanding.tsx','utf8');
  assert.match(landing,/LANDING_COPY/);
  assert.match(landing,/hero1:"Tu LightBurn\."/);
  assert.match(landing,/hero1:"Votre LightBurn\."/);
  assert.match(landing,/hero1:"Ihr LightBurn\."/);
  assert.doesNotMatch(landing,/const c=intl\?INTL:BR/);
});

test('logged-in Laser workspace exposes the language selector',async()=>{
  const workspace=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  assert.match(workspace,/LanguageMenu/);
  assert.match(workspace,/<LanguageMenu\/>/);
  assert.match(workspace,/WORKSPACE_NAV/);
  assert.match(workspace,/es:\{home:'Inicio'/);
  assert.match(workspace,/fr:\{home:'Accueil'/);
  assert.match(workspace,/de:\{home:'Startseite'/);
});
