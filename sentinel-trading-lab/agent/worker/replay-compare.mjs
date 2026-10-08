import {pathToFileURL} from 'node:url';
import {replayJournal,analyzeReplayFrame} from './replay.mjs';

const day=ms=>new Date(Number(ms)).toISOString().slice(0,10);
function tally(rows,payout){
  const filled=rows.filter(x=>x.filled&&typeof x.won==='boolean');
  const wins=filled.filter(x=>x.won).length,losses=filled.length-wins;
  return{samples:filled.length,wins,losses,winRate:filled.length?wins/filled.length:null,
    netUnits:wins*payout-losses};
}
export function compareReplayReports(baseline,experimental,{payout=.8,delays=[0,1000,2000]}={}){
  if(!(payout>0&&payout<=1))throw Error('payout_must_be_0_to_1');
  const b=baseline.signalOutcomes||[],e=experimental.signalOutcomes||[];
  const days=[...new Set(b.filter(x=>x.filled&&x.won!==null).map(x=>day(x.signalAt)))].sort();
  const heldOutDays=days.slice(Math.ceil(days.length*.65));
  const trainDays=days.slice(0,Math.ceil(days.length*.65));
  const evaluated=delays.map(delay=>{
    const base=b.filter(x=>x.delayMs===delay),trial=e.filter(x=>x.delayMs===delay);
    const inHold=x=>heldOutDays.includes(day(x.signalAt));
    const baseVal=base.filter(inHold),trialVal=trial.filter(inHold);
    const allBase=tally(base,payout),allTrial=tally(trial,payout);
    const valBase=tally(baseVal,payout),valTrial=tally(trialVal,payout);
    const coverage=valBase.samples?valTrial.samples/valBase.samples:0;
    const netPerHundredBaseline=valBase.samples?
      (valTrial.netUnits-valBase.netUnits)*100/valBase.samples:null;
    const winDeltaPp=valBase.winRate!=null&&valTrial.winRate!=null?
      Math.round((valTrial.winRate-valBase.winRate)*10000)/100:null;
    const improvementDays=heldOutDays.filter(d=>{
      const x=tally(baseVal.filter(z=>day(z.signalAt)===d),payout),y=tally(trialVal.filter(z=>day(z.signalAt)===d),payout);
      return y.netUnits>x.netUnits;
    }).length;
    const valid=days.length>=6&&trainDays.length>=3&&heldOutDays.length>=2&&
      allBase.samples>=200&&allTrial.samples>=120&&valBase.samples>=90&&valTrial.samples>=65&&
      coverage>=.65&&winDeltaPp>=3&&netPerHundredBaseline>0&&
      improvementDays>=Math.ceil(heldOutDays.length*.67);
    return{delayMs:delay,baseline:allBase,experimental:allTrial,
      heldOut:{baseline:valBase,experimental:valTrial,coverage,
        winDeltaPp,netPerHundredBaseline,improvementDays,totalDays:heldOutDays.length},
      passed:valid};
  });
  const sufficientData=days.length>=6&&evaluated.every(x=>x.baseline.samples>=200&&x.experimental.samples>=120);
  return {baseVersion:'13.4.11',trialVersion:'13.4.15',method:'strict chronological held-out replay',
    payoutAssumption:payout,marketDays:days.length,trainDays,heldOutDays,
    sufficientData,approvedToPromote:sufficientData&&evaluated.every(x=>x.passed),
    evaluated,warning:'This replays local quote journals, not broker receipts. No journal means no accuracy claim. Alerts alone cannot authorize live trading.'};
}
export async function compareJournals(paths,{payout=.8}={}){
 const baseline=await replayJournal(paths,{includeSignalOutcomes:true,
   analyze:(runtime,snap,now)=>{runtime.settings.pathGuardMode='shadow';
     return analyzeReplayFrame(runtime,snap,now)}});
 const experimental=await replayJournal(paths,{includeSignalOutcomes:true,
   analyze:(runtime,snap,now)=>{runtime.settings.pathGuardMode='enforce';
     return analyzeReplayFrame(runtime,snap,now)}});
 return compareReplayReports(baseline,experimental,{payout});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const paths=process.argv.slice(2);
 if(!paths.length)throw Error('Usage: node worker/replay-compare.mjs journal-1.jsonl [journal-2.jsonl ...]');
 console.log(JSON.stringify(await compareJournals(paths),null,2));
}