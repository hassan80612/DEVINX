'use client';
import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import {defaultLocale,direction,type Locale} from './config';
import {ptBR} from './messages/pt-BR';

type DeepWiden<T>=T extends string?string:T extends (...args:infer A)=>infer R?(...args:A)=>R:T extends readonly(infer U)[]?DeepWiden<U>[]:T extends object?{[K in keyof T]:DeepWiden<T[K]>}:T;
export type Messages=DeepWiden<typeof ptBR>;
const catalogs:Partial<Record<Locale,Messages>>={'pt-BR':ptBR};
const I18nContext=createContext<{locale:Locale;messages:Messages;setLocale:(locale:Locale)=>void}>({locale:defaultLocale,messages:ptBR,setLocale:()=>{}});

export function I18nProvider({children}:{children:React.ReactNode}){const[locale,setLocaleState]=useState<Locale>(defaultLocale);useEffect(()=>{const stored=localStorage.getItem('devinx_locale') as Locale|null;if(stored&&['pt-BR','en','es','ar'].includes(stored))setLocaleState(stored)},[]);useEffect(()=>{document.documentElement.lang=locale;document.documentElement.dir=direction(locale)},[locale]);const value=useMemo(()=>({locale,messages:catalogs[locale]??ptBR,setLocale:(next:Locale)=>{localStorage.setItem('devinx_locale',next);setLocaleState(next)}}),[locale]);return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>}
export function useI18n(){return useContext(I18nContext)}
