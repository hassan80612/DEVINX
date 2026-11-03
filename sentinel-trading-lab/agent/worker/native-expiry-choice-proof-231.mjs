// Prevent an unselected broker 30s DEFAULT from masquerading as a later
// explicit user choice when reconciling Agent and embedded localStorage.
// A deliberate 30s manual/analyst choice is still valid and preserved.
export function trustedExpiryChoice231(receipt){
 const value=Number(receipt?.value),selectedAt=Number(receipt?.selectedAt||0);
 if(![30000,60000,300000].includes(value))return false;
 if(value!==30000)return true;
 return receipt?.explicitDefault===true&&selectedAt>0;
}
export function proveExplicitNativeDefault231({value,source,selectedAt=0,alreadyExplicit=false}={}){
 if(Number(value)!==30000)return false;
 return source==='manual'||source==='analyst'||
  (source==='agent'&&Number(selectedAt)>0)||alreadyExplicit===true;
}
