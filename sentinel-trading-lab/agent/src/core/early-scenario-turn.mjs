// Prospective, quote-only reversal pressure for the MAIN forecast.
//
// This is directional evidence, not an entry veto, a counter-trend order or
// a claimed win probability. It operates on price samples received so far;
// no closing bar, future price, or independent subanalyst is consulted.
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));
export function earlyScenarioTurn({micro={},short={},price,upper=null,lower=null,expectedMove=0,seconds=60}={}){
  const neutral={side:null,signal:0,strength:0,phase:'NEUTRO',basis:'received-quote-pressure'};
  if(micro?.ready!==true||Number(seconds)>120||!Number.isFinite(Number(price))||Number(price)<=0)return neutral;
  const d15=Number(micro.delta15),d30=Number(micro.delta30);
  if(!Number.isFinite(d15)||!Number.isFinite(d30))return neutral;
  // Use the existing 15s/30s slope as context. Unlike the entry engine,
  // changing this projection never turns a quote into an executable order.
  const direction=d15>0&&d30>=0?1:d15<0&&d30<=0?-1:0;
  if(!direction)return neutral;
  const call=direction>0,side=call?'PUT':'CALL';
  const lead=clamp(-direction*Number(micro.lead),0,1);
  const expected2=Math.max(Math.abs(Number(micro.expected2)||0),Number(price)*.0000005,1e-12);
  const d2=Number(micro.delta2)||0;
  const opposingPulse=clamp(-direction*d2/(expected2*2),0,1);
  const weakening=Number(call?short.weakeningUp:short.weakeningDown)===1?1:0;
  const stretched=Number(call?short.callStretched:short.putStretched)===1?1:0;
  const rejection=Number(call?short.failedBreakUp:short.failedBreakDown)===1?1:0;
  const level=Number(call?upper:lower);
  const validLevel=(call?upper:lower)!=null&&Number.isFinite(level)&&level>0;
  const space=validLevel?(call?level-Number(price):Number(price)-level):Infinity;
  const normalizedRoom=Math.max(Math.abs(Number(expectedMove)||0),expected2*3,Math.abs(Number(price))*.000004);
  // Close to the established support/resistance is contextual evidence.
  // A distant level, or a broken one, is not itself a turning-point signal.
  const nearLevel=validLevel&&space>=0?clamp(1-space/normalizedRoom,0,1):0;
  const changing=clamp(lead*.46+opposingPulse*.27+weakening*.17+rejection*.10,0,1);
  const context=.55+nearLevel*.27+stretched*.13+rejection*.05;
  const strength=clamp(changing*context,0,1);
  const signal=strength>0?(side==='CALL'?strength:-strength):0;
  return{side,signal,strength,phase:strength>=.52?'VIRADA EM FORMACAO':strength>=.22?'PERDA DE FORCA':'TENDENCIA EM CURSO',
    basis:'received-quote-pressure',lead,opposingPulse,weakening,stretched,rejection,nearLevel,validLevel};
}
