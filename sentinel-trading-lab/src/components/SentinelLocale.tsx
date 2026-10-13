'use client';
import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import {sentinelLanguage,sentinelText} from '../../agent/src/core/ui-texts.mjs';
type Lang='pt'|'en';
type LocaleState={language:Lang,setLanguage:(next:Lang)=>void,t:(phrase:string)=>string};
const Context=createContext<LocaleState|null>(null);
const KEY='sentinel-ui-language';
export function SentinelLocaleProvider({children}:{children:React.ReactNode}){
  const [language,setLanguage]=useState<Lang>('pt');
  useEffect(()=>{
    try{setLanguage(sentinelLanguage(localStorage.getItem(KEY)))}catch{}
  },[]);
  useEffect(()=>{
    try{localStorage.setItem(KEY,language)}catch{}
    document.documentElement.lang=language==='en'?'en':'pt-BR';
  },[language]);
  const value=useMemo(()=>({language,setLanguage,t:(phrase:string)=>sentinelText(language,phrase)}),[language]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSentinelLocale(){
 const value=useContext(Context);
 if(!value)throw new Error('SentinelLocaleProvider missing');
 return value;
}
export function T({children}:{children:string}){
 const {t}=useSentinelLocale();
 return <>{t(children)}</>;
}
export function LanguageSwitcher(){
 const {language,setLanguage}=useSentinelLocale();
 return <select aria-label={language==='pt'?'Idioma':'Language'} value={language}
   onChange={e=>setLanguage(sentinelLanguage(e.target.value))}
   style={{padding:'7px 9px',border:'1px solid currentColor',borderRadius:8,
     color:'inherit',background:'transparent',fontSize:12,fontWeight:700,maxWidth:120}}>
   <option value="pt" style={{color:'#181818'}}>Português</option>
   <option value="en" style={{color:'#181818'}}>English</option>
 </select>;
}
