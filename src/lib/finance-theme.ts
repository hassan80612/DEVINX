export type FinanceTheme='dark'|'light';

export const FINANCE_THEME_STORAGE_KEY='devinx_finance_theme';
export const FINANCE_THEME_EVENT='devinx:theme-updated';

export function isFinanceTheme(value:unknown):value is FinanceTheme{
  return value==='dark'||value==='light';
}

export function readFinanceTheme():FinanceTheme{
  if(typeof window==='undefined')return 'dark';
  try{
    const stored=window.localStorage.getItem(FINANCE_THEME_STORAGE_KEY);
    return isFinanceTheme(stored)?stored:'dark';
  }catch{return 'dark'}
}

export function writeFinanceTheme(theme:FinanceTheme){
  if(typeof window==='undefined')return;
  try{window.localStorage.setItem(FINANCE_THEME_STORAGE_KEY,theme)}catch{}
  window.dispatchEvent(new CustomEvent(FINANCE_THEME_EVENT,{detail:{theme}}));
}
