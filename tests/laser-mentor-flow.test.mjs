import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('mentor connection is code-only, temporary and server-gated',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const route=await readFile('src/app/api/laser-control/mentor/route.ts','utf8');
  const invoke=await readFile('src/features/laser-control/server/invoke-master-function.ts','utf8');
  assert.match(panel,/action:'claim',code/);
  assert.match(panel,/action:'close',sessionId/);
  assert.match(panel,/connection_mode==='mentor'/);
  assert.match(panel,/mentor_session_id/);
  assert.match(route,/laser-mentor-session/);
  assert.match(invoke,/get_laser_access_status/);
});

test('mobile touch works on the normal preview while keyboard stays manual',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  assert.match(panel,/refreshRemoteSession/);
  assert.doesNotMatch(panel,/event\.pointerType==='touch'&&!document\.fullscreenElement/);
  assert.match(panel,/sendRemoteInput\(\{type:'doubleclick'/);
  const doubleTap=panel.slice(panel.indexOf("if(isDouble)"),panel.indexOf("if(isDouble)")+260);
  assert.doesNotMatch(doubleTap,/openMobileKeyboard/);
  const sendEdit=panel.slice(panel.indexOf('function sendMobileEdit()'),panel.indexOf('function closeActiveDialog()'));
  assert.doesNotMatch(sendEdit,/Enter/);
});

test('Laser workspace is translated through DevinX i18n',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const catalogs=await readFile('src/i18n/catalogs.ts','utf8');
  const laser=await readFile('src/i18n/laser.ts','utf8');
  assert.match(panel,/useI18n/);
  assert.match(catalogs,/laserCatalogs/);
  for(const locale of ["'pt-BR'","en:","es:","fr:","de:","ar:"])assert.ok(laser.includes(locale));
});


test('leaving fullscreen keeps remote input enabled and simple touch uses one click message',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  assert.doesNotMatch(panel,/fullscreenAutoInputRef/);
  const exit=panel.slice(panel.indexOf('async function exitFullscreen()'),panel.indexOf('async function setOrientationMode'));
  assert.doesNotMatch(exit,/disableRemoteInput/);
  assert.match(panel,/sendRemoteInput\(\{type:'click',\.\.\.point,button:0\}\)/);
});


test('visible Laser workspace actions use i18n and mobile help matches normal-view touch',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const laser=await readFile('src/i18n/laser.ts','utf8');
  for(const key of ['laser.operate','laser.frameDiode','laser.moreTools','laser.keyboardPlaceholder','laser.startConfirm']){
    assert.match(panel,new RegExp(key.replace('.','\\.')));
    assert.equal((laser.match(new RegExp("'"+key.replace('.','\\.')+"'","g"))||[]).length,6);
  }
  assert.doesNotMatch(laser,/celular usa tela cheia para toque|mobile uses fullscreen touch|móvil usa toque en pantalla completa/);
});


test('Agent 1.0.28 is distributed as direct permanent and mentor executables without ZIP or CMD',async()=>{
  const runtime=await readFile('laser-agent/AgentRuntime.cs','utf8');
  const install=await readFile('laser-agent/AgentInstallation.cs','utf8');
  const workflow=await readFile('.github/workflows/laser-agent-check.yml','utf8');
  const mentorPage=await readFile('src/app/laser-control/mentoria/MentorDownloadPage.tsx','utf8');
  assert.match(runtime,/exeName\.Contains\("Mentoria"/);
  assert.match(install,/File\.Copy\(current,staged,overwrite:true\)/);
  assert.match(install,/StopInstalledCopyIfRunning/);
  assert.match(workflow,/DevinX-Laser-Agent-1\.0\.28\.exe/);
  assert.match(workflow,/DevinX-Mentoria-1\.0\.28\.exe/);
  assert.doesNotMatch(workflow,/Compress-Archive|INICIAR-MENTORIA\.cmd|1\.0\.28\.zip/);
  assert.match(mentorPage,/DevinX-Mentoria-1\.0\.28\.exe/);
});


test('mentor panel exposes student share actions and public mentoring link',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const laser=await readFile('src/i18n/laser.ts','utf8');
  assert.match(panel,/https:\/\/devinx\.com\.br\/laser-control\/mentoria/);
  assert.match(panel,/laser\.mentorCopyLink/);
  assert.match(panel,/https:\/\/wa\.me\/\?text=/);
  assert.match(panel,/mailto:\?subject=/);
  assert.equal((laser.match(/'laser\.mentorShareTitle'/g)||[]).length,6);
});
