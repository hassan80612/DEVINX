export const FINANCE_UPDATED_EVENT='devinx:finance-updated';
export const GOAL_UPDATED_EVENT='devinx:goal-updated';

export function notifyFinanceUpdated(){
  if(typeof window==='undefined')return;
  window.dispatchEvent(new CustomEvent(FINANCE_UPDATED_EVENT));
}

export function notifyGoalUpdated(){
  if(typeof window==='undefined')return;
  window.dispatchEvent(new CustomEvent(GOAL_UPDATED_EVENT));
}
