'use client';

import {useEffect,useMemo,useState} from 'react';
import {useI18n} from '@/i18n/provider';

export type CalculatorMode='scientific'|'financial';
type AngleUnit='deg'|'rad';
type Operator='+'|'-'|'×'|'÷'|'^';
type FinanceTool='compound'|'simple'|'loan'|'margin'|'percent';

type ScientificState={
  display:string;
  stored:number|null;
  pending:Operator|null;
  waiting:boolean;
  memory:number;
  angle:AngleUnit;
  history:string[];
};

type FinanceFields={
  compound:{principal:string;rate:string;periods:string};
  simple:{principal:string;rate:string;periods:string};
  loan:{amount:string;rate:string;periods:string};
  margin:{cost:string;sale:string};
  percent:{base:string;rate:string};
};

type FinanceResult={
  tool:FinanceTool;
  primary:number;
  rows:Array<{key:string;value:number;percent?:boolean}>;
};

type FinanceState={
  tool:FinanceTool;
  fields:FinanceFields;
  result:FinanceResult|null;
  history:string[];
};

const WORKSPACE_KEY='devinx_calculator_workspace_v1';
const MODE_KEY='devinx_calculator_default_mode';

const freshScientific=():ScientificState=>({
  display:'0',stored:null,pending:null,waiting:false,memory:0,angle:'deg',history:[]
});
const freshFinance=():FinanceState=>({
  tool:'compound',
  fields:{
    compound:{principal:'',rate:'',periods:''},
    simple:{principal:'',rate:'',periods:''},
    loan:{amount:'',rate:'',periods:''},
    margin:{cost:'',sale:''},
    percent:{base:'',rate:''}
  },
  result:null,
  history:[]
});

function parseNumber(raw:string){
  let value=String(raw??'').trim().replace(/\s/g,'');
  if(!value)return 0;
  if(value.includes(',')&&value.includes('.')){
    if(value.lastIndexOf(',')>value.lastIndexOf('.'))value=value.replace(/\./g,'').replace(',','.');
    else value=value.replace(/,/g,'');
  }else if(value.includes(','))value=value.replace(',','.');
  const number=Number(value);
  return Number.isFinite(number)?number:0;
}

function cleanNumber(value:number){
  if(!Number.isFinite(value))return 'Error';
  if(Object.is(value,-0))value=0;
  const abs=Math.abs(value);
  if(abs!==0&&(abs>=1e12||abs<1e-9))return value.toExponential(8).replace(/\.0+e/,'e');
  return String(Number(value.toPrecision(12)));
}

function operation(a:number,b:number,op:Operator){
  if(op==='+')return a+b;
  if(op==='-')return a-b;
  if(op==='×')return a*b;
  if(op==='÷')return b===0?NaN:a/b;
  return Math.pow(a,b);
}

function preference():CalculatorMode{
  if(typeof window==='undefined')return 'financial';
  try{return localStorage.getItem(MODE_KEY)==='scientific'?'scientific':'financial'}catch{return 'financial'}
}

export function CalculatorModePreference(){
  const{t}=useI18n();
  const[mode,setMode]=useState<CalculatorMode>('financial');
  useEffect(()=>setMode(preference()),[]);
  function choose(next:CalculatorMode){
    setMode(next);
    try{localStorage.setItem(MODE_KEY,next)}catch{}
    window.dispatchEvent(new CustomEvent('devinx:calculator-preference',{detail:next}));
  }
  return <section className="panel calculatorPreference">
    <div className="sectionTitleRow">
      <div><small>{t('calculator.preferenceEyebrow')}</small><h2>{t('calculator.defaultMode')}</h2></div>
      <span className="calculatorModeBadge">{mode==='financial'?'$':'ƒx'}</span>
    </div>
    <p className="lead">{t('calculator.defaultModeHelp')}</p>
    <div className="calculatorPreferenceChoices" role="radiogroup" aria-label={t('calculator.defaultMode')}>
      <button type="button" className={mode==='financial'?'active':''} onClick={()=>choose('financial')} aria-pressed={mode==='financial'}><span>$</span><b>{t('calculator.financial')}</b></button>
      <button type="button" className={mode==='scientific'?'active':''} onClick={()=>choose('scientific')} aria-pressed={mode==='scientific'}><span>ƒx</span><b>{t('calculator.scientific')}</b></button>
    </div>
  </section>;
}

export function ProCalculator({variant='floating'}:{variant?:'floating'|'embedded'}){
  const{t,locale,currency}=useI18n();
  const[open,setOpen]=useState(false);
  const[hydrated,setHydrated]=useState(false);
  const[preferredMode,setPreferredMode]=useState<CalculatorMode>('financial');
  const[mode,setMode]=useState<CalculatorMode>('financial');
  const[sci,setSci]=useState<ScientificState>(freshScientific);
  const[finance,setFinance]=useState<FinanceState>(freshFinance);

  function loadWorkspace(forcePreferred=false){
    const preferred=preference();
    setPreferredMode(preferred);
    try{
      const raw=localStorage.getItem(WORKSPACE_KEY);
      if(raw){
        const parsed=JSON.parse(raw);
        if(parsed?.sci)setSci({...freshScientific(),...parsed.sci});
        if(parsed?.finance)setFinance({...freshFinance(),...parsed.finance,fields:{...freshFinance().fields,...parsed.finance?.fields}});
        if(!forcePreferred&&(parsed?.mode==='scientific'||parsed?.mode==='financial'))setMode(parsed.mode);
      }
    }catch{}
    if(forcePreferred)setMode(preferred);
  }

  useEffect(()=>{
    loadWorkspace(false);
    setHydrated(true);
    const onPreference=(event:Event)=>{
      const next=(event as CustomEvent<CalculatorMode>).detail;
      if(next==='scientific'||next==='financial')setPreferredMode(next);
    };
    window.addEventListener('devinx:calculator-preference',onPreference);
    return()=>window.removeEventListener('devinx:calculator-preference',onPreference);
  },[]);

  useEffect(()=>{
    if(!hydrated)return;
    try{localStorage.setItem(WORKSPACE_KEY,JSON.stringify({mode,sci,finance}))}catch{}
  },[hydrated,mode,sci,finance]);

  const decimalSeparator=useMemo(()=>{
    const parts=new Intl.NumberFormat(locale).formatToParts(1.1);
    return parts.find(part=>part.type==='decimal')?.value||'.';
  },[locale]);

  const displayText=sci.display==='Error'?t('calculator.error'):sci.display.replace('.',decimalSeparator);

  function openFloating(){
    loadWorkspace(true);
    setOpen(true);
  }

  function pushSciHistory(line:string){
    setSci(current=>({...current,history:[line,...current.history].slice(0,12)}));
  }

  function inputDigit(digit:string){
    setSci(current=>{
      if(current.display==='Error'||current.waiting)return{...current,display:digit,waiting:false};
      const next=current.display==='0'?digit:current.display+digit;
      return{...current,display:next};
    });
  }

  function inputDecimal(){
    setSci(current=>{
      if(current.display==='Error'||current.waiting)return{...current,display:'0.',waiting:false};
      if(current.display.includes('.'))return current;
      return{...current,display:current.display+'.'};
    });
  }

  function chooseOperator(op:Operator){
    setSci(current=>{
      const input=Number(current.display);
      if(!Number.isFinite(input))return freshScientific();
      if(current.pending&&current.stored!==null&&!current.waiting){
        const result=operation(current.stored,input,current.pending);
        if(!Number.isFinite(result))return{...freshScientific(),display:'Error'};
        return{...current,display:cleanNumber(result),stored:result,pending:op,waiting:true};
      }
      return{...current,stored:input,pending:op,waiting:true};
    });
  }

  function equals(){
    const current=sci;
    if(!current.pending||current.stored===null)return;
    const input=Number(current.display);
    const result=operation(current.stored,input,current.pending);
    if(!Number.isFinite(result)){setSci({...freshScientific(),display:'Error'});return}
    const text=cleanNumber(result);
    pushSciHistory(cleanNumber(current.stored)+' '+current.pending+' '+cleanNumber(input)+' = '+text);
    setSci(prev=>({...prev,display:text,stored:null,pending:null,waiting:true}));
  }

  function unary(kind:'sin'|'cos'|'tan'|'ln'|'log'|'sqrt'|'square'|'inverse'){
    const value=Number(sci.display);
    if(!Number.isFinite(value))return;
    const radians=sci.angle==='deg'?value*Math.PI/180:value;
    let result=0;
    if(kind==='sin')result=Math.sin(radians);
    else if(kind==='cos')result=Math.cos(radians);
    else if(kind==='tan')result=Math.tan(radians);
    else if(kind==='ln')result=value>0?Math.log(value):NaN;
    else if(kind==='log')result=value>0?Math.log10(value):NaN;
    else if(kind==='sqrt')result=value>=0?Math.sqrt(value):NaN;
    else if(kind==='square')result=value*value;
    else result=value===0?NaN:1/value;
    if(!Number.isFinite(result)){setSci(current=>({...current,display:'Error',waiting:true}));return}
    const text=cleanNumber(result);
    pushSciHistory(kind+'('+cleanNumber(value)+') = '+text);
    setSci(current=>({...current,display:text,waiting:true}));
  }

  function percent(){
    const value=Number(sci.display);
    if(!Number.isFinite(value))return;
    setSci(current=>({...current,display:cleanNumber(value/100),waiting:true}));
  }

  function toggleSign(){
    setSci(current=>{
      const value=Number(current.display);
      if(!Number.isFinite(value))return current;
      return{...current,display:cleanNumber(-value)};
    });
  }

  function backspace(){
    setSci(current=>{
      if(current.waiting||current.display==='Error')return current;
      const next=current.display.length<=1?'0':current.display.slice(0,-1);
      return{...current,display:next==='-'?'0':next};
    });
  }

  function constant(value:number){
    setSci(current=>({...current,display:cleanNumber(value),waiting:true}));
  }

  function memory(action:'clear'|'recall'|'add'|'subtract'){
    setSci(current=>{
      const value=Number(current.display)||0;
      if(action==='clear')return{...current,memory:0};
      if(action==='recall')return{...current,display:cleanNumber(current.memory),waiting:true};
      if(action==='add')return{...current,memory:current.memory+value};
      return{...current,memory:current.memory-value};
    });
  }

  function clearScientific(){
    setSci(current=>({...freshScientific(),angle:current.angle,memory:current.memory}));
  }

  function setFinanceField(group:FinanceTool,key:string,value:string){
    setFinance(current=>({
      ...current,
      result:null,
      fields:{...current.fields,[group]:{...(current.fields as any)[group],[key]:value}}
    }));
  }

  function calculateFinance(){
    const f=finance.fields;
    let result:FinanceResult|null=null;

    if(finance.tool==='compound'){
      const p=parseNumber(f.compound.principal),rate=parseNumber(f.compound.rate)/100,n=parseNumber(f.compound.periods);
      if(p>0&&n>0&&rate>-1){
        const final=p*Math.pow(1+rate,n);
        result={tool:'compound',primary:final,rows:[{key:'futureValue',value:final},{key:'interest',value:final-p}]};
      }
    }else if(finance.tool==='simple'){
      const p=parseNumber(f.simple.principal),rate=parseNumber(f.simple.rate)/100,n=parseNumber(f.simple.periods);
      if(p>0&&n>0){
        const interest=p*rate*n;
        result={tool:'simple',primary:p+interest,rows:[{key:'futureValue',value:p+interest},{key:'interest',value:interest}]};
      }
    }else if(finance.tool==='loan'){
      const amount=parseNumber(f.loan.amount),rate=parseNumber(f.loan.rate)/100,n=Math.round(parseNumber(f.loan.periods));
      if(amount>0&&n>0&&rate>=0){
        const price=rate===0?amount/n:amount*rate/(1-Math.pow(1+rate,-n));
        const priceTotal=price*n;
        const amort=amount/n;
        const sacFirst=amort+amount*rate;
        const sacLast=amort+amort*rate;
        const sacInterest=amount*rate*(n+1)/2;
        result={tool:'loan',primary:price,rows:[
          {key:'pricePayment',value:price},{key:'priceTotal',value:priceTotal},{key:'totalInterest',value:priceTotal-amount},
          {key:'sacFirst',value:sacFirst},{key:'sacLast',value:sacLast},{key:'sacInterest',value:sacInterest}
        ]};
      }
    }else if(finance.tool==='margin'){
      const cost=parseNumber(f.margin.cost),sale=parseNumber(f.margin.sale);
      if(cost>=0&&sale>0){
        const profit=sale-cost;
        result={tool:'margin',primary:profit,rows:[
          {key:'profit',value:profit},
          {key:'marginPct',value:(profit/sale)*100,percent:true},
          {key:'markupPct',value:cost===0?0:(profit/cost)*100,percent:true}
        ]};
      }
    }else{
      const base=parseNumber(f.percent.base),rate=parseNumber(f.percent.rate);
      if(Number.isFinite(base)&&Number.isFinite(rate)){
        const part=base*rate/100;
        result={tool:'percent',primary:part,rows:[
          {key:'percentValue',value:part},{key:'addedValue',value:base+part},{key:'discountedValue',value:base-part}
        ]};
      }
    }

    if(!result){
      setFinance(current=>({...current,result:null}));
      return;
    }
    const line=t('calculator.'+result.tool)+' · '+(result.rows[0]?.percent?cleanNumber(result.primary)+'%':currency(Math.round(result.primary*100)));
    setFinance(current=>({...current,result,history:[line,...current.history].slice(0,10)}));
  }

  function useFinanceResult(){
    if(!finance.result)return;
    setSci(current=>({...current,display:cleanNumber(finance.result!.primary),waiting:true}));
    setMode('scientific');
  }

  function resetWorkspace(){
    setSci(freshScientific());
    setFinance(freshFinance());
    try{localStorage.removeItem(WORKSPACE_KEY)}catch{}
  }

  const financeToolLabel=(tool:FinanceTool)=>t('calculator.'+tool);
  const metricLabel=(key:string)=>t('calculator.'+key);

  const financialFields=()=>{
    if(finance.tool==='compound'||finance.tool==='simple'){
      const fields=finance.fields[finance.tool];
      return <>
        <label>{t('calculator.principal')}<input value={fields.principal} onChange={e=>setFinanceField(finance.tool,'principal',e.target.value)} inputMode="decimal" placeholder="0,00"/></label>
        <label>{t('calculator.rate')}<input value={fields.rate} onChange={e=>setFinanceField(finance.tool,'rate',e.target.value)} inputMode="decimal" placeholder="0,00"/></label>
        <label>{t('calculator.periods')}<input value={fields.periods} onChange={e=>setFinanceField(finance.tool,'periods',e.target.value)} inputMode="decimal" placeholder="0"/></label>
      </>;
    }
    if(finance.tool==='loan'){
      const fields=finance.fields.loan;
      return <>
        <label>{t('calculator.financedAmount')}<input value={fields.amount} onChange={e=>setFinanceField('loan','amount',e.target.value)} inputMode="decimal" placeholder="0,00"/></label>
        <label>{t('calculator.rate')}<input value={fields.rate} onChange={e=>setFinanceField('loan','rate',e.target.value)} inputMode="decimal" placeholder="0,00"/></label>
        <label>{t('calculator.periods')}<input value={fields.periods} onChange={e=>setFinanceField('loan','periods',e.target.value)} inputMode="numeric" placeholder="0"/></label>
      </>;
    }
    if(finance.tool==='margin'){
      const fields=finance.fields.margin;
      return <>
        <label>{t('calculator.cost')}<input value={fields.cost} onChange={e=>setFinanceField('margin','cost',e.target.value)} inputMode="decimal" placeholder="0,00"/></label>
        <label>{t('calculator.sale')}<input value={fields.sale} onChange={e=>setFinanceField('margin','sale',e.target.value)} inputMode="decimal" placeholder="0,00"/></label>
      </>;
    }
    const fields=finance.fields.percent;
    return <>
      <label>{t('calculator.baseValue')}<input value={fields.base} onChange={e=>setFinanceField('percent','base',e.target.value)} inputMode="decimal" placeholder="0,00"/></label>
      <label>{t('calculator.rate')}<input value={fields.rate} onChange={e=>setFinanceField('percent','rate',e.target.value)} inputMode="decimal" placeholder="0,00"/></label>
    </>;
  };

  const body=<div className="proCalculator">
    <div className="calculatorHeader">
      <div><small>DEVINX · PRO</small><h2>{t('calculator.title')}</h2><p>{t('calculator.subtitle')}</p></div>
      <div className="calculatorHeaderActions">
        <button type="button" className="calculatorReset" onClick={resetWorkspace}>{t('calculator.reset')}</button>
        {variant==='floating'&&<button type="button" className="calculatorClose" onClick={()=>setOpen(false)} aria-label={t('common.close')}>×</button>}
      </div>
    </div>

    <div className="calculatorModeTabs">
      <button type="button" className={mode==='financial'?'active':''} onClick={()=>setMode('financial')}><span>$</span>{t('calculator.financial')}</button>
      <button type="button" className={mode==='scientific'?'active':''} onClick={()=>setMode('scientific')}><span>ƒx</span>{t('calculator.scientific')}</button>
    </div>

    {mode==='scientific'?<div className="scientificCalculator">
      <div className="scientificDisplay">
        <div><span>{sci.memory!==0?'M':''}</span><small>{sci.angle==='deg'?t('calculator.degree'):t('calculator.radian')}</small></div>
        <strong>{displayText}</strong>
        <small>{sci.pending&&sci.stored!==null?cleanNumber(sci.stored)+' '+sci.pending:' '}</small>
      </div>
      <div className="angleSwitch">
        <button type="button" className={sci.angle==='deg'?'active':''} onClick={()=>setSci(current=>({...current,angle:'deg'}))}>DEG</button>
        <button type="button" className={sci.angle==='rad'?'active':''} onClick={()=>setSci(current=>({...current,angle:'rad'}))}>RAD</button>
      </div>
      <div className="scientificKeys">
        <button className="fn" type="button" onClick={()=>constant(Math.PI)}>π</button>
        <button className="fn" type="button" onClick={()=>constant(Math.E)}>e</button>
        <button className="fn" type="button" onClick={()=>unary('sin')}>sin</button>
        <button className="fn" type="button" onClick={()=>unary('cos')}>cos</button>
        <button className="fn" type="button" onClick={()=>unary('tan')}>tan</button>

        <button className="fn" type="button" onClick={()=>unary('ln')}>ln</button>
        <button className="fn" type="button" onClick={()=>unary('log')}>log</button>
        <button className="fn" type="button" onClick={()=>unary('sqrt')}>√x</button>
        <button className="fn" type="button" onClick={()=>unary('square')}>x²</button>
        <button className="fn" type="button" onClick={()=>unary('inverse')}>1/x</button>

        <button className="memory" type="button" onClick={()=>memory('clear')}>MC</button>
        <button className="memory" type="button" onClick={()=>memory('recall')}>MR</button>
        <button className="memory" type="button" onClick={()=>memory('add')}>M+</button>
        <button className="memory" type="button" onClick={()=>memory('subtract')}>M−</button>
        <button className="fn" type="button" onClick={percent}>%</button>

        <button type="button" onClick={()=>inputDigit('7')}>7</button>
        <button type="button" onClick={()=>inputDigit('8')}>8</button>
        <button type="button" onClick={()=>inputDigit('9')}>9</button>
        <button className="operator" type="button" onClick={()=>chooseOperator('÷')}>÷</button>
        <button className="operator" type="button" onClick={()=>chooseOperator('^')}>xʸ</button>

        <button type="button" onClick={()=>inputDigit('4')}>4</button>
        <button type="button" onClick={()=>inputDigit('5')}>5</button>
        <button type="button" onClick={()=>inputDigit('6')}>6</button>
        <button className="operator" type="button" onClick={()=>chooseOperator('×')}>×</button>
        <button className="fn" type="button" onClick={toggleSign}>±</button>

        <button type="button" onClick={()=>inputDigit('1')}>1</button>
        <button type="button" onClick={()=>inputDigit('2')}>2</button>
        <button type="button" onClick={()=>inputDigit('3')}>3</button>
        <button className="operator" type="button" onClick={()=>chooseOperator('-')}>−</button>
        <button className="fn" type="button" onClick={backspace}>⌫</button>

        <button type="button" onClick={()=>inputDigit('0')}>0</button>
        <button type="button" onClick={inputDecimal}>{decimalSeparator}</button>
        <button className="clear" type="button" onClick={clearScientific}>AC</button>
        <button className="operator" type="button" onClick={()=>chooseOperator('+')}>+</button>
        <button className="equals" type="button" onClick={equals}>=</button>
      </div>
      <div className="calculatorHistory">
        <div className="calculatorSubhead"><b>{t('calculator.history')}</b><span>{sci.history.length}</span></div>
        {sci.history.length===0?<p>{t('calculator.noHistory')}</p>:sci.history.slice(0,5).map((line,index)=><div key={index}>{line}</div>)}
      </div>
    </div>:<div className="financialCalculator">
      <div className="financeToolTabs">
        {(['compound','simple','loan','margin','percent'] as FinanceTool[]).map(tool=><button type="button" key={tool} className={finance.tool===tool?'active':''} onClick={()=>setFinance(current=>({...current,tool,result:null}))}>{financeToolLabel(tool)}</button>)}
      </div>
      <div className="financeFormulaHint">{finance.tool==='loan'?'PRICE + SAC':finance.tool==='compound'?'VF = VP × (1 + i)ⁿ':finance.tool==='simple'?'J = VP × i × n':finance.tool==='margin'?'Margem · Markup · Lucro':'% × Base'}</div>
      <div className="financeFields">{financialFields()}</div>
      <button type="button" className="primary financeCalculate" onClick={calculateFinance}>{t('calculator.calculate')}</button>

      {finance.result&&<div className="financeResult">
        <div className="financeResultHero"><small>{financeToolLabel(finance.result.tool)}</small><strong>{finance.result.rows[0]?.percent?cleanNumber(finance.result.primary)+'%':currency(Math.round(finance.result.primary*100))}</strong></div>
        <div className="financeResultGrid">{finance.result.rows.map((row,index)=><span key={row.key+index}><small>{metricLabel(row.key)}</small><b>{row.percent?cleanNumber(row.value)+'%':currency(Math.round(row.value*100))}</b></span>)}</div>
        <button type="button" className="goldOutline useResultButton" onClick={useFinanceResult}>{t('calculator.useResult')}</button>
      </div>}

      <div className="calculatorHistory">
        <div className="calculatorSubhead"><b>{t('calculator.history')}</b><span>{finance.history.length}</span></div>
        {finance.history.length===0?<p>{t('calculator.noHistory')}</p>:finance.history.slice(0,5).map((line,index)=><div key={index}>{line}</div>)}
      </div>
    </div>}
  </div>;

  if(variant==='embedded')return <section className="panel proCalculatorEmbedded">{body}</section>;

  return <>
    <button type="button" className="calculatorFab" onClick={openFloating} aria-label={t('calculator.title')}>
      <span>{preferredMode==='financial'?'$':'ƒx'}</span><b>{t('calculator.floatingLabel')}</b>
    </button>
    {open&&<div className="calculatorBackdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}>
      <section className="calculatorSheet" role="dialog" aria-modal="true" aria-label={t('calculator.title')}>{body}</section>
    </div>}
  </>;
}
