// Only a uniquely selected instrument can replace the existing market.
export function selectVisibleBrokerTab(rows=[]){
 const entries=rows.filter(x=>typeof x?.symbol==='string'&&x.symbol.trim());
 if(!entries.length)return null;
 const key=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 const names=new Map();
 for(const r of entries)names.set(key(r.symbol),r.symbol);
 if(names.size===1)return [...names.values()][0];
 const selected=new Map();
 for(const r of entries)if(r.selected===true)selected.set(key(r.symbol),r.symbol);
 return selected.size===1?[...selected.values()][0]:null;
}
