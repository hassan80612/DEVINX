// Reproduce the frozen 230 native picker code byte-for-byte after removing
// exactly four reviewed Sentinel 232 user-choice safety edits. Other keeper
// changes still fail the 201 historical SHA regression.
const edits=[
  [
    "  // Incoming unmarked 30s is the broker bootstrap default, not a user\n  // instruction. Only explicit 30s choices may replace saved 1m/5m.\n  if(ms===30000&&!explicit&&Number(localStorage.getItem(key))>30000)return true;",
    "  if(ms===30000&&!explicit&&Number(localStorage.getItem(key))>30000&&at<=storedAt)return true;"
  ],
  [
    "   // A durable Agent receipt alone never proves 30s was clicked manually.\n   // Mark a 30s preference only after a true analyst/native user action.\n   explicitDefault=v===30000&&(source==='manual'||source==='analyst'||explicitDefault);",
    "   explicitDefault=v===30000&&(source==='manual'||source==='analyst'||source==='agent'||explicitDefault);"
  ],
  [
    "   if(ms===30000&&!explicit&&preferredMs>30000&&!explicitDefault)return true;",
    "   if(ms===30000&&!explicit&&preferredMs>30000&&!explicitDefault&&!(at>localAt))return true;"
  ],
  [
    "   if(!explicit&&at>0&&localAt>at&&!(ms>30000&&preferredMs===30000&&!explicitDefault))return true;",
    "   if(!explicit&&at>0&&localAt>at)return true;"
  ]
];
export function normalize232NativeKeeper(source){
 let output=String(source);
 for(const [changed,baseline] of edits){
  if(output.split(changed).length!==2)throw Error('232 native picker change differs from reviewed patch');
  output=output.replace(changed,baseline);
 }
 return output;
}
