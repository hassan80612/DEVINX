import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const source=readFileSync(fileURLToPath(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url)),'utf8');
// Regression: Android users must be able to erase "60", type "7", then "70".
// Clamping on every keypress previously replaced incomplete drafts with "50".
assert.match(source,/const\[averageInput,setAverageInput\]=useState\('60'\)/);
assert.match(source,/setAverageInput\(draft\)/);
assert.match(source,/onBlur=\{commitAverage\}/);
assert.doesNotMatch(source,/setAverageThreshold\(Math\.max\(50/);
assert.match(source,/aria-label="Limite visual da média" type="text" inputMode="numeric"/);
assert.match(source,/aria-label="Limite do Cenário" type="text" inputMode="numeric"/);
assert.match(source,/thresholdEditing\.current/);
assert.match(source,/onBlur=\{commitScenario\}/);
console.log('PASS: mobile numeric inputs preserve partial typing and validate on blur');
