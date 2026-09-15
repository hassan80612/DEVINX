export function localDateISO(date=new Date()){
  const year=date.getFullYear();
  const month=String(date.getMonth()+1).padStart(2,'0');
  const day=String(date.getDate()).padStart(2,'0');
  return `${year}-${month}-${day}`;
}

export function localMonthStartISO(date=new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-01`;
}

export function localMonthEndISO(date=new Date()){
  const end=new Date(date.getFullYear(),date.getMonth()+1,0);
  return localDateISO(end);
}

export function localMonthKey(date=new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}
