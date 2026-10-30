// A visible broker may contain multiple open instrument tabs. Prefer the
// one actually selected; never pick an arbitrary first item or an old cache.
// Distinct explicit signals disagreeing => ambiguous (return null).
export function selectVisibleBrokerTab(rows=[]){
 const clean=rows.filter(x=>typeof x?.symbol==='string'&&x.symbol.trim());
 if(!clean.length)return null;
 const key=s=>String(s).toUpperCase().replace(/[^A-Z0-9]/g,'');
 const unique=entries=>{
  const m=new Map();
  for(const item of entries)m.set(key(item.symbol),item.symbol);
  return m.size===1?[...m.values()][0]:null;
 };
 const explicit=clean.filter(x=>x.selected===true);
 if(explicit.length)return unique(explicit);
 const visuallyActive=clean.filter(x=>x.visualSelected===true);
 if(visuallyActive.length)return unique(visuallyActive);
 return unique(clean); // A single visible instrument is unambiguous.
}
