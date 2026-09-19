'use client';

import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import {catalogs,defaultLocale,direction,languageNames,locales,type Locale} from './catalogs';

type I18nContextValue={
  locale:Locale;
  setLocale:(locale:Locale)=>void;
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

const Context=createContext<I18nContextValue>({
  locale:defaultLocale,
  setLocale:()=>{},
  t:(key)=>catalogs[defaultLocale][key]||key,
  currency:(minor)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(minor/100),
  date:(value)=>new Intl.DateTimeFormat('pt-BR').format(new Date(value)),
  languageNames,
  locales
});

export function I18nProvider({children}:{children:React.ReactNode}){
  const[locale,setLocaleState]=useState<Locale>(defaultLocale);

  useEffect(()=>{setLocaleState(detectLocale())},[]);
  useEffect(()=>{
    document.documentElement.lang=locale;
    document.documentElement.dir=direction(locale);
    document.body.dir=direction(locale);
    try{localStorage.setItem('devinx_locale',locale)}catch{}
  },[locale]);

  const value=useMemo<I18nContextValue>(()=>({
    locale,
    setLocale:(next)=>setLocaleState(next),
    t:(key)=>catalogs[locale][key]??catalogs.en[key]??key,
    currency:(minor)=>new Intl.NumberFormat(locale,{style:'currency',currency:'BRL'}).format((Number(minor)||0)/100),
    date:(value,options)=>new Intl.DateTimeFormat(locale,options).format(typeof value==='string'?new Date(value.includes('T')?value:value+'T12:00:00'):value),
    languageNames,
    locales
  }),[locale]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useI18n(){return useContext(Context)}
