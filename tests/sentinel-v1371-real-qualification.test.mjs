import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadPriceOnlyJournals, scoredSide, summarizePaired,
  qualifyPairedRows, regimeBeforeIssue, HORIZONS} from
  '../sentinel-trading-lab/agent/worker/qualify-future-entry.mjs';

test('paired score is on FUTURE entry to FUTURE expiry, no magic accuracy', () => {
  const rows = [
    {oldSide:'PUT',newSide:'CALL',trueSide:'CALL'},
    {oldSide:'CALL',newSide:'PUT',trueSide:'CALL'},
    {oldSide:'CALL',newSide:'PUT',trueSide:'DRAW'},
    {oldSide:'CALL',newSide:null,trueSide:'CALL'}
  ];
  const s = summarizePaired(rows);
  assert.equal(s.eligible,4);
  assert.equal(s.comparable,3);
  assert.equal(s.rescued,1);
  assert.equal(s.harmed,1);
  assert.equal(s.wins67,1);
  assert.equal(s.wins70,1);
  assert.equal(s.draws,1);
  assert.equal(s.coveragePct,75);
  assert.equal(scoredSide(null,'CALL'),null);
  assert.equal(scoredSide('CALL','DRAW'),false);
});

test('qualification fails closed even if tiny synthetic sample claims 100%', () => {
  const rows = [{oldSide:'PUT',newSide:'CALL',trueSide:'CALL',
    engine:'automatic',h:30,regime:'trend',issuedAt:Date.UTC(2026,9,11)}];
  const decision = qualifyPairedRows(rows);
  assert.equal(decision.eligibleForHumanReview,false);
  assert.equal(decision.approvedForAutomaticPromotion,false);
  assert.ok(decision.blockers.includes('insufficient_independent_market_days'));
  assert.ok(decision.blockers.includes('insufficient_holdout_outcomes'));
  assert.ok(decision.blockers.some(x=>x.startsWith('missing_independent_evidence')));
  assert.equal(HORIZONS.length,6);
});

test('market journal never makes late backfill appear available earlier', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sentinel-qualify-'));
  const path=join(dir,'one.jsonl');
  const e=[
    {schema:2,type:'market',ts:10000,provider:'iq_option',asset:'EUR/USD OTC',
      quoteTs:10000,quote:1.10,quotes:[{ts:10000,price:1.10}]},
    // Broker supplies older timestamp in later message. It was not known at 10s.
    {schema:2,type:'market',ts:25000,provider:'iq_option',asset:'EUR/USD OTC',
      quoteTs:25000,quote:1.12,
      quotes:[{ts:11000,price:1.11},{ts:25000,price:1.12}]}
  ];
  try{
    await writeFile(path,e.map(x=>JSON.stringify(x)).join('\n')+'\n');
    const data=await loadPriceOnlyJournals([path]);
    assert.equal(data.series.length,1);
    const old=data.series[0].quotes.find(q=>q.ts===11000);
    assert.equal(old.receivedAt,25000);
    assert.ok(old.receivedAt>10000);
  }finally{await rm(dir,{recursive:true,force:true})}
});

test('historical regime labeling uses only known quotes and is descriptive',()=>{
  const t=Date.UTC(2026,9,11);
  const history=Array.from({length:80},(_,i)=>
    ({ts:t+i*1000,price:1.1+i*.00001}));
  assert.ok(['trend','mixed','oscillation','reversal-in-progress','unknown']
    .includes(regimeBeforeIssue(history,t+79000)));
});
