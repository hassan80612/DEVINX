import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sentinelText} from '../sentinel-trading-lab/agent/src/core/ui-texts.mjs';
const panel=fs.readFileSync('sentinel-trading-lab/src/app/console/page.tsx','utf8');
const agent=JSON.parse(fs.readFileSync('sentinel-trading-lab/agent/release.json','utf8'));

test('published web release is clearly 67.30, installed Agent is still accurately 67.29',()=>{
 assert.match(panel,/const WEB_RELEASE_VERSION='67\.30'/);
 assert.match(panel,/PAINEL SENTINEL.*WEB \{WEB_RELEASE_VERSION\}/);
 assert.match(panel,/const AVAILABLE_AGENT_VERSION='13\.4\.67\.29'/);
 assert.equal(agent.version,'13.4.67.29');
});
test('all Agent download anchors use internationalized button labels',()=>{
 const anchors=panel.match(/<a[^>]*AGENT_DOWNLOAD_URL[^>]*>[^<]*<\/a>/g)||[];
 assert.ok(anchors.length>=2);
 for(const anchor of anchors)assert.match(anchor,/\{t\('Baixar Agent V'\)\}/);
 assert.equal(sentinelText('pt','Baixar Agent V'),'Baixar Agent V');
 assert.equal(sentinelText('en','Baixar Agent V'),'Download Agent V');
});
test('unavailable Agent also describes payment in English',()=>{
 assert.equal(sentinelText('en','Compra necessária'),'Purchase required');
 assert.equal(sentinelText('en','Aguardando compra'),'Awaiting purchase');
 assert.match(panel,/\{t\('Compra necessária'\)\}/);
 assert.match(panel,/\{t\('Aguardando compra'\)\}/);
});
test('this change does not rename the downloaded Windows binary as 67.30',()=>{
 assert.match(panel,/downloads\/Sentinel-Agent-13\.4\.67\.29\.exe/);
 assert.doesNotMatch(panel,/downloads\/Sentinel-Agent-13\.4\.67\.30\.exe/);
});
