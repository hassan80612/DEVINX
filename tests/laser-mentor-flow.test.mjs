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


test('Agent 1.1.0 uses separate permanent and mentor-only builds without ZIP or CMD',async()=>{
  const runtime=await readFile('laser-agent/AgentRuntime.cs','utf8');
  const install=await readFile('laser-agent/AgentInstallation.cs','utf8');
  const workflow=await readFile('.github/workflows/laser-agent-check.yml','utf8');
  const mentorPage=await readFile('src/app/laser-control/mentoria/MentorDownloadPage.tsx','utf8');
  assert.match(runtime,/DEVINX_MENTOR_ONLY/);
  assert.doesNotMatch(runtime,/exeName\.Contains/);
  assert.match(install,/File\.Copy\(current,staged,overwrite:true\)/);
  assert.match(install,/StopInstalledCopyIfRunning/);
  assert.match(workflow,/DevinX-Laser-Agent-1\.1\.3\.exe/);
  assert.match(workflow,/DevinX-Mentoria-1\.1\.3\.exe/);
  assert.match(workflow,/publish-agent/);
  assert.match(workflow,/publish-mentor/);
  assert.match(workflow,/DefineConstants=DEVINX_MENTOR_ONLY/);
  assert.match(workflow,/Permanent Agent and Mentoria must be different binaries/);
  assert.doesNotMatch(workflow,/Compress-Archive|INICIAR-MENTORIA\.cmd|1\.1\.3\.zip/);
  assert.match(mentorPage,/DevinX-Mentoria-1\.1\.3\.exe/);
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


test('student mentoring download page stays public without DevinX login',async()=>{
  const middleware=await readFile('src/middleware.ts','utf8');
  assert.match(middleware,/laser-control\/mentoria/);
  assert.match(middleware,/const publicLaserPage=/);
});


test('mentor mode allows only one local instance and keeps one pending identity',async()=>{
  const program=await readFile('laser-agent/Program.cs','utf8');
  const mentor=await readFile('laser-agent/MentorMode.cs','utf8');
  const guard=await readFile('laser-agent/SingleInstanceGuard.cs','utf8');
  assert.match(program,/DevinXLaserMentor/);
  assert.match(program,/Mentoria DevinX já está aberta/);
  const mentorStart=mentor.slice(0,mentor.indexOf('var identity=AgentIdentityStore.GetOrCreate()')+60);
  assert.doesNotMatch(mentorStart,/AgentLocalState\.ResetAll/);
  assert.match(guard,/SingleInstanceGuard\(string name=/);
});

test('mentor UI explains why a connection failed',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const laser=await readFile('src/i18n/laser.ts','utf8');
  assert.match(panel,/mentorDeviceActive/);
  assert.match(panel,/mentorRateLimited/);
  assert.match(panel,/mentorServerError/);
  assert.match(panel,/mentorInlineNotice/);
  assert.equal((laser.match(/'laser\.mentorDeviceActive'/g)||[]).length,6);
});


test('mobile keyboard replaces the currently selected LightBurn field instead of appending',async()=>{
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const remote=await readFile('laser-agent/LightBurnRemoteInput.cs','utf8');
  assert.match(panel,/type:'replace_text'/);
  assert.doesNotMatch(panel.slice(panel.indexOf('async function sendMobileEdit()'),panel.indexOf('function closeActiveDialog()')),/sendRemoteKey\('a'/);
  assert.match(remote,/"replace_text"=>ReplaceFocusedText/);
  assert.match(remote,/GetFocusedElement/);
  assert.match(remote,/SetValue\(text\)/);
});


test('permanent Agent download is gated by Laser access while student Mentoria stays public',async()=>{
  const route=await readFile('src/app/api/laser-control/agent-download/route.ts','utf8');
  const panel=await readFile('src/components/LaserControlWorkspace.tsx','utf8');
  const landing=await readFile('src/components/LaserLanding.tsx','utf8');
  const mentorPage=await readFile('src/app/laser-control/mentoria/MentorDownloadPage.tsx','utf8');
  assert.match(route,/getLaserControlAccess/);
  assert.match(route,/!access\.authenticated/);
  assert.match(route,/!access\.isAdmin&&!access\.ownerAccess/);
  assert.match(panel,/\/api\/laser-control\/agent-download/);
  assert.doesNotMatch(landing,/DevinX-Laser-Agent-1\.1\.3\.exe/);
  assert.match(landing,/\/laser-control\/mentoria/);
  assert.match(mentorPage,/DevinX-Mentoria-1\.1\.3\.exe/);
});
