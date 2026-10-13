import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync('sentinel-trading-lab/src/app/console/page.tsx','utf8');
test('Sign out clears session and navigates to public home',()=>{
 const logout=src.match(/<button className="secondary logoutBtn"[^>]+onClick=\{async\(\)=>\{([\s\S]*?)\}\}>/);
 assert.ok(logout,'logout button present');
 assert.match(logout[1],/await fetch\('\/api\/auth\/logout',\{method:'POST'\}\)/);
 assert.match(logout[1],/window\.location\.replace\('\/'\)/);
 assert.doesNotMatch(logout[1],/window\.location\.(?:href|replace)\s*=?.*['"]\/login/);
});
