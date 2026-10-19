// RESEARCH ONLY. Not connected to the released worker/runtime constructor.
// Scores disagreements using non-overlapping, already matured 30s outcomes.
import {CompletedExpiryDirection} from '../sentinel-trading-lab/agent/src/core/completed-expiry-direction.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
export class ContextCompletedConflictChoice extends CompletedExpiryDirection {
  reset(context) {
    super.reset(context);
    this.conflictPending=[];this.conflictHistory={};this.lastConflictIssued=-Infinity;
    this.lastConflictQuote=-Infinity;this.lastConflictEvidence=null;
    this.researchCounts={conflicts:0,overrides:0,matured:0};
  }
  observe(args) {
    const projection=super.observe(args),ts=Number(args.quoteAt),spot=Number(args.price);
    if(!(ts>0&&ts<=args.now&&args.now-ts<=1450&&spot>0)||ts<this.lastConflictQuote)return projection;
    if(ts>this.lastConflictQuote){
      this.conflictPending=this.conflictPending.filter(p=>{
        if(ts<p.dueAt)return true;
        if(ts<=p.dueAt+1000&&spot!==p.price){
          const actual=spot>p.price?'CALL':'PUT';
          const xs=this.conflictHistory[p.kind]??=[];
          xs.push({at:ts,correct:p.side===actual});
          if(xs.length>40)xs.shift();
          this.researchCounts.matured++;
        }
        return false;
      });
      this.lastConflictQuote=ts;
    }
    const structural=analyzeNowOpportunity({...args,engineId:'automatic',qualityPolicy:'adaptive-market-v1',durationMs:30000});
    const kind=structural.reason==='causal-expiry-analogue'?'analogue':
      structural.reason==='closed-range-extreme-reversal-confirmed'?'range':null;
    this.lastConflictEvidence={at:ts,projection:projection.side,structural:structural.side,
      structuralReason:structural.reason,projectionReady:projection.ready,structuralReady:structural.ready,kind,overridden:false};
    if(!kind||!projection.ready||!structural.ready||projection.side===structural.side)return projection;
    this.researchCounts.conflicts++;
    const history=(this.conflictHistory[kind]??[]).filter(p=>p.at>=ts-1800000);
    this.conflictHistory[kind]=history;
    if(ts-this.lastConflictIssued>=30000){
      this.lastConflictIssued=ts;
      this.conflictPending.push({kind,price:spot,side:structural.side,dueAt:ts+30000});
    }
    const wins=history.filter(p=>p.correct).length,n=history.length;
    // Predeclared conservative rule: at least six independent expiries,
    // and >=70% after symmetric Beta(2,2) shrinkage. No warm-up gate.
    if(n<6||(wins+2)/(n+4)<.7)return projection;
    this.researchCounts.overrides++;
    this.lastConflictEvidence.overridden=true;
    return {...structural,reason:'research-context-completed-conflict-choice',
      conflictChoice:{kind,completed:n,structuralWins:wins,previousSide:projection.side}};
  }
}
