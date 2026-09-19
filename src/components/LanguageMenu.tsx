'use client';

import {useEffect,useRef,useState} from 'react';
import {useI18n} from '@/i18n/provider';

export function LanguageMenu({fullWidth=false}:{fullWidth?:boolean}){
  const{locale,setLocale,locales,languageNames,t}=useI18n();
  const[open,setOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    function close(event:MouseEvent){
      if(ref.current&&!ref.current.contains(event.target as Node))setOpen(false);
    }
    document.addEventListener('mousedown',close);
    return()=>document.removeEventListener('mousedown',close);
  },[]);

  return <div ref={ref} className={'languageMenu'+(fullWidth?' fullWidth':'')}>
    <button type="button" className="languageMenuButton" onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-label={t('settings.language')}>
      <span>{languageNames[locale]}</span><em>{open?'▴':'▾'}</em>
    </button>
    {open&&<div className="languageMenuList" role="menu">
      {locales.map(item=><button type="button" role="menuitem" key={item} className={item===locale?'active':''} onClick={()=>{setLocale(item);setOpen(false)}}>{languageNames[item]}{item===locale&&<span>✓</span>}</button>)}
    </div>}
  </div>;
}
