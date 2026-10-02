import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Laser public offer matches Control 2 PCs and Mentor 5 PCs with unlimited students',async()=>{
  const landing=await readFile('src/components/LaserLanding.tsx','utf8');
  assert.match(landing,/2 PCs · uso próprio/);
  assert.match(landing,/5 PCs · alunos ilimitados/);
  assert.match(landing,/2 PCs · 30 days/);
  assert.match(landing,/5 PCs · 30 days · unlimited students/);
  assert.match(landing,/alumnos ilimitados/);
  assert.match(landing,/élèves illimités/);
  assert.match(landing,/unbegrenzte Schüler/);
  assert.match(landing,/طلاب غير محدودين/);
  assert.doesNotMatch(landing,/10 sessões incluídas|10 sessions included|10 sesiones incluidas|10 Sitzungen im Mentor-Plan/);
});

test('Control student add-on is gated while Mentor does not sell student packs',async()=>{
  const workspace=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const route=await readFile('src/app/api/laser-control/student-addon-checkout/route.ts','utf8');
  assert.match(workspace,/planId==='control'/);
  assert.match(workspace,/get_laser_mentor_sessions_remaining/);
  assert.match(workspace,/student-addon-checkout/);
  assert.match(workspace,/nav\.mentorUnlimited/);
  assert.doesNotMatch(workspace,/\+5 sessões de mentoria|\+5 mentoring sessions/);
  assert.match(route,/access\.planId!=='control'/);
  assert.match(route,/2Td87KB/);
  assert.match(route,/2sFxGp1/);
});

test('database rules make Mentor unlimited and keep Control student access metered',async()=>{
  const migration=await readFile('supabase/migrations/20261001233000_laser_plan_benefits.sql','utf8');
  assert.match(migration,/p_source='kiwify' and p_plan_id='mentor' then 5/);
  assert.match(migration,/p_source='kiwify' and p_plan_id='control' then 2/);
  assert.match(migration,/v_students integer:=1/);
  assert.match(migration,/where c\.plan_id='control'/);
  assert.match(migration,/if v_ent\.plan_id='mentor' then[\s\S]{0,160}v_credits_charged:=0/);
  assert.match(migration,/plan_id='control'[\s\S]{0,160}mentor_credits_balance>0/);
  assert.match(migration,/v_active>=v_limit/);
  assert.match(migration,/interval '6 hours'/);
});

test('guide documents the same commercial rules in every supported locale',async()=>{
  const guide=await readFile('src/app/laser-control/guia/guide-copy.ts','utf8');
  for(const text of [
    'alunos ilimitados','unlimited students','alumnos ilimitados',
    'élèves illimités','unbegrenzte Schüler','طلاباً غير محدودين'
  ])assert.ok(guide.includes(text),text);
  assert.doesNotMatch(guide,/inclui 10 sessões|includes 10 sessions|incluye 10 sesiones|enthält 10 Sitzungen/);
});
