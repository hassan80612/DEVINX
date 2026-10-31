export const FINANCE_UPDATED_EVENT='devinx:finance-updated';
export const GOAL_UPDATED_EVENT='devinx:goal-updated';
// Cross-tab signal only; financial records remain in Supabase.
export const FINANCE_SYNC_STORAGE_KEY='devinx:finance-sync-v1';

export function notifyFinanceUpdated(){
  if(typeof window==='undefined')return;
  window.dispatchEvent(new CustomEvent(FINANCE_UPDATED_EVENT));
  try{window.localStorage.setItem(FINANCE_SYNC_STORAGE_KEY,Date.now()+':'+Math.random().toString(36).slice(2))}catch{}
}

export function notifyGoalUpdated(){
  if(typeof window==='undefined')return;
  window.dispatchEvent(new CustomEvent(GOAL_UPDATED_EVENT));
}
