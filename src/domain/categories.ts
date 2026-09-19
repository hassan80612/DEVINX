export type CategoryKind='income'|'expense';
export type SystemCategory={id:string;key:string;icon:string};
export type CustomCategory={id:string;kind:CategoryKind;name:string;icon:string;show_in_quick:boolean;is_active:boolean};

export const EXPENSE_CATEGORIES:SystemCategory[]=[
  {id:'housing',key:'cat.housing',icon:'⌂'},{id:'food',key:'cat.food',icon:'🍽️'},{id:'groceries',key:'cat.groceries',icon:'🛒'},
  {id:'transport',key:'cat.transport',icon:'🚗'},{id:'health',key:'cat.health',icon:'✚'},{id:'education',key:'cat.education',icon:'🎓'},
  {id:'utilities',key:'cat.utilities',icon:'⚡'},{id:'internet',key:'cat.internet',icon:'◉'},{id:'subscriptions',key:'cat.subscriptions',icon:'↻'},
  {id:'leisure',key:'cat.leisure',icon:'★'},{id:'other',key:'cat.other',icon:'+'}
];
export const INCOME_CATEGORIES:SystemCategory[]=[
  {id:'salary',key:'cat.salary',icon:'▣'},{id:'commission',key:'cat.commission',icon:'%'},{id:'overtime',key:'cat.overtime',icon:'◷'},
  {id:'bonus',key:'cat.bonus',icon:'★'},{id:'allowance',key:'cat.allowance',icon:'+'},{id:'extra',key:'cat.extra',icon:'↗'},{id:'other',key:'cat.other',icon:'…'}
];

export function systemCategories(kind:CategoryKind){return kind==='expense'?EXPENSE_CATEGORIES:INCOME_CATEGORIES}
export function categoryOptions(kind:CategoryKind,custom:CustomCategory[],t:(key:string)=>string=(key)=>key,includeInactive=false){
  return [
    ...systemCategories(kind).map(c=>({id:c.id,name:t(c.key),icon:c.icon,custom:false,active:true,showInQuick:true})),
    ...custom.filter(c=>c.kind===kind&&(includeInactive||c.is_active)).map(c=>({id:c.id,name:c.name,icon:c.icon||'•',custom:true,active:c.is_active,showInQuick:c.show_in_quick}))
  ];
}
export function categoryName(kind:CategoryKind,id:string,custom:CustomCategory[],t:(key:string)=>string=(key)=>key){
  return categoryOptions(kind,custom,t,true).find(c=>c.id===id)?.name||t('common.category');
}
