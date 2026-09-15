export type CategoryKind='income'|'expense';
export type SystemCategory={id:string;name:string;icon:string};
export type CustomCategory={id:string;kind:CategoryKind;name:string;icon:string;show_in_quick:boolean;is_active:boolean};

export const EXPENSE_CATEGORIES:SystemCategory[]=[
  {id:'housing',name:'Moradia',icon:'⌂'},
  {id:'food',name:'Alimentação',icon:'🍽️'},
  {id:'groceries',name:'Mercado',icon:'🛒'},
  {id:'transport',name:'Transporte',icon:'🚗'},
  {id:'health',name:'Saúde',icon:'✚'},
  {id:'education',name:'Educação',icon:'🎓'},
  {id:'utilities',name:'Água e energia',icon:'⚡'},
  {id:'internet',name:'Internet',icon:'◉'},
  {id:'subscriptions',name:'Assinaturas',icon:'↻'},
  {id:'leisure',name:'Lazer',icon:'★'},
  {id:'other',name:'Outros',icon:'+'}
];

export const INCOME_CATEGORIES:SystemCategory[]=[
  {id:'salary',name:'Salário',icon:'▣'},
  {id:'commission',name:'Comissão',icon:'%'},
  {id:'overtime',name:'Hora extra',icon:'◷'},
  {id:'bonus',name:'Bônus',icon:'★'},
  {id:'allowance',name:'Adicional',icon:'+'},
  {id:'extra',name:'Renda extra',icon:'↗'},
  {id:'other',name:'Outros',icon:'…'}
];

export function systemCategories(kind:CategoryKind){return kind==='expense'?EXPENSE_CATEGORIES:INCOME_CATEGORIES}
export function categoryOptions(kind:CategoryKind,custom:CustomCategory[],includeInactive=false){
  return [
    ...systemCategories(kind).map(c=>({...c,custom:false,active:true,showInQuick:true})),
    ...custom.filter(c=>c.kind===kind&&(includeInactive||c.is_active)).map(c=>({id:c.id,name:c.name,icon:c.icon||'•',custom:true,active:c.is_active,showInQuick:c.show_in_quick}))
  ];
}
export function categoryName(kind:CategoryKind,id:string,custom:CustomCategory[]){return categoryOptions(kind,custom,true).find(c=>c.id===id)?.name||'Categoria'}
