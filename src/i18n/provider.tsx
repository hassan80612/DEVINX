'use client';

import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import {catalogs,defaultLocale,direction,languageNames,locales,type Locale} from './catalogs';

export const SUPPORTED_CURRENCIES=[
  'BRL','USD','EUR','PYG','ARS','CLP','COP','MXN','PEN','UYU',
  'GBP','CAD','CHF','CNY','JPY','INR','AED','SAR','AUD','NZD','BOB'
] as const;
export type CurrencyCode=(typeof SUPPORTED_CURRENCIES)[number];

type I18nContextValue={
  locale:Locale;
  setLocale:(locale:Locale)=>void;
  currencyCode:CurrencyCode;
  setCurrencyCode:(currency:CurrencyCode)=>void;
  timezone:string;
  setTimezone:(timezone:string)=>void;
  t:(key:string)=>string;
  currency:(minor:number)=>string;
  date:(value:string|Date,options?:Intl.DateTimeFormatOptions)=>string;
  languageNames:Record<Locale,string>;
  locales:readonly Locale[];
};

function detectLocale():Locale{
  if(typeof navigator==='undefined')return defaultLocale;
  const saved=typeof localStorage!=='undefined'?localStorage.getItem('devinx_locale'):null;
  if(saved&&locales.includes(saved as Locale))return saved as Locale;
  const candidates=[...(navigator.languages||[]),navigator.language].filter(Boolean);
  for(const candidate of candidates){
    const primary=String(candidate).toLowerCase().split(/[-_]/)[0];
    if(primary==='pt')return 'pt-BR';
    const match=locales.find(item=>item===primary);
    if(match)return match;
  }
  return 'en';
}

function deviceTimezone(){
  try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Sao_Paulo'}catch{return 'America/Sao_Paulo'}
}
function resolvedTimezone(preference:string){
  return !preference||preference==='auto'?deviceTimezone():preference;
}
function isCurrencyCode(value:string|null):value is CurrencyCode{
  return !!value&&SUPPORTED_CURRENCIES.includes(value as CurrencyCode);
}

const Context=createContext<I18nContextValue>({
  locale:defaultLocale,
  setLocale:()=>{},
  currencyCode:'BRL',
  setCurrencyCode:()=>{},
  timezone:'auto',
  setTimezone:()=>{},
  t:(key)=>catalogs[defaultLocale][key]||key,
  currency:(minor)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(minor/100),
  date:(value)=>new Intl.DateTimeFormat('pt-BR').format(new Date(value)),
  languageNames,
  locales
});

export function I18nProvider({children}:{children:React.ReactNode}){
  const[locale,setLocaleState]=useState<Locale>(defaultLocale);
  const[currencyCode,setCurrencyCodeState]=useState<CurrencyCode>('BRL');
  const[timezone,setTimezoneState]=useState('auto');

  useEffect(()=>{
    setLocaleState(detectLocale());
    try{
      const savedCurrency=localStorage.getItem('devinx_currency');
      if(isCurrencyCode(savedCurrency))setCurrencyCodeState(savedCurrency);
      const savedTimezone=localStorage.getItem('devinx_timezone');
      if(savedTimezone)setTimezoneState(savedTimezone);
    }catch{}
  },[]);

  useEffect(()=>{
    document.documentElement.lang=locale;
    document.documentElement.dir=direction(locale);
    document.body.dir=direction(locale);
    try{localStorage.setItem('devinx_locale',locale)}catch{}
  },[locale]);
  useEffect(()=>{try{localStorage.setItem('devinx_currency',currencyCode)}catch{}},[currencyCode]);
  useEffect(()=>{try{localStorage.setItem('devinx_timezone',timezone)}catch{}},[timezone]);

  const value=useMemo<I18nContextValue>(()=>({
    locale,
    setLocale:(next)=>setLocaleState(next),
    currencyCode,
    setCurrencyCode:(next)=>setCurrencyCodeState(next),
    timezone,
    setTimezone:(next)=>setTimezoneState(next||'auto'),
    t:(key)=>catalogs[locale][key]??catalogs.en[key]??key,
    currency:(minor)=>new Intl.NumberFormat(locale,{style:'currency',currency:currencyCode}).format((Number(minor)||0)/100),
    date:(value,options)=>{
      const isPlainDate=typeof value==='string'&&!value.includes('T');
      const input=typeof value==='string'?new Date(isPlainDate?value+'T12:00:00':value):value;
      const config=isPlainDate?options:{...options,timeZone:resolvedTimezone(timezone)};
      return new Intl.DateTimeFormat(locale,config).format(input);
    },
    languageNames,
    locales
  }),[locale,currencyCode,timezone]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useI18n(){return useContext(Context)}
