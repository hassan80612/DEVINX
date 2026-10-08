import {readFileSync} from 'node:fs';
const release=JSON.parse(readFileSync(new URL('../release.json',import.meta.url),'utf8'));
if(!release.version||!release.build)throw new Error('agent_release_metadata_missing');
export const {version:VERSION,build:BUILD}=release;
