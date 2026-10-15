import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const pc=readFileSync('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs','utf8');
const css=readFileSync('sentinel-trading-lab/src/app/globals.css','utf8');
const mobile=readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
const model=readFileSync('sentinel-trading-lab/src/lib/pc-authoritative-window.mjs','utf8');
test('PC overlay selection controls occupy one row, not a tall strategy column',()=>{
 const block=pc.slice(pc.indexOf('<div data-sentinel-pc-selection-row'),pc.indexOf('<section data-sentinel-role="horizon-outlook"'));
 assert.match(block,/grid-template-columns:minmax\(0,1fr\) minmax\(126px,\.38fr\)/);
 assert.match(block,/data-sentinel-setting="engine"/);
 assert.match(block,/data-sentinel-setting="duration"/);
 const intro=block.slice(0,block.indexOf('</div>'));
 assert.doesNotMatch(intro,/data-sentinel-strategy-when/);
 assert.match(block,/<details data-sentinel-pc-strategy-guide/);
 assert.doesNotMatch(block,/<details data-sentinel-pc-strategy-guide[^>]*\bopen\b/);
});
test('PC technical strategy explanation stays collapsed until user expands it',()=>{
 assert.match(pc,/<details data-testid="pc-strategy-when-guide"/);
 assert.match(pc,/<summary data-sentinel-no-drag="1"/);
 assert.match(pc,/data-sentinel-preserve-open="1"/);
});
test('site PC sizing changes are limited to desktop and do not affect floating card',()=>{
 assert.match(css,/@media \(min-width:901px\)/);
 assert.match(css,/\.app\.marketWorkspace:not\(\.compactAnalyst\) \.liveScenario/);
 assert.match(css,/\.app\.marketWorkspace:not\(\.compactAnalyst\) \.vnextFutureReceipt\{\s*display:flex/);
 assert.match(css,/\.app\.marketWorkspace:not\(\.compactAnalyst\) \.liveControls\{/);
 assert.match(css,/\.app\.marketWorkspace:not\(\.compactAnalyst\) \.vnextMobileReadingsGrid>div/);
});
test('phone expanded details expand a real grid row instead of overlapping live readings',()=>{
 assert.match(css,/@media\(max-width:900px\)\{\s*\.liveScenario \.vnextFutureReceipt:has\(> \.vnextForecastDetails\[open\]\)/);
 assert.match(css,/grid-template-rows:20px 27px 74px 49px 27px auto/);
 assert.match(mobile,/data-testid="vnext-forecast-details"/);
});
test('PC / mobile authoritative countdown remains unchanged, not reimplemented',()=>{
 assert.match(mobile,/pcAuthoritativeWindow\(/);
 assert.match(mobile,/pcClockNow\(/);
 assert.match(mobile,/setInterval\(update,200\)/);
 assert.match(model,/export function pcAuthoritativeWindow/);
 assert.match(pc,/data-sentinel-vnext-clock/);
});
