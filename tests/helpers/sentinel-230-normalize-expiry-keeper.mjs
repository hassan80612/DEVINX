// Normalize precisely the audited one-expression 230 change before the
// frozen H207 native expiry keeper SHA regression; no other source is ignored.
export function normalize230NativeKeeper(text){
 const original="   explicitDefault=v===30000&&(source==='manual'||source==='analyst'||source==='agent'||explicitDefault);";
 const changed=`   // An Agent/bootstrap 30s with NO trusted selection timestamp is the
   // broker's DEFAULT, not a manual 30s choice. Previous code marked every
   // Agent 30s as explicit and made it override a user's later 1m/5m.
   explicitDefault=v===30000&&(source==='manual'||source==='analyst'||
    (source==='agent'&&at>0)||explicitDefault);`;
 if(text.split(changed).length!==2)throw Error('sentinel_230_keeper_normalization_mismatch');
 return text.replace(changed,original);
}
