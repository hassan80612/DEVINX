const encoder=new TextEncoder();
const HEX64=/^[0-9a-f]{64}$/;

function base64Bytes(value:string){
  const raw=atob(value);
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}

function pemSpki(pem:string){
  const body=pem
    .replace(/-----BEGIN PUBLIC KEY-----/g,"")
    .replace(/-----END PUBLIC KEY-----/g,"")
    .replace(/\s+/g,"");
  return base64Bytes(body);
}

export function hex(bytes:ArrayBuffer|Uint8Array){
  const a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  return Array.from(a,b=>b.toString(16).padStart(2,"0")).join("");
}

export async function verifyPreviewSignature(args:{
  deviceId:string;
  fingerprint:string;
  sentAt:number;
  capturedAt:number;
  width:number;
  height:number;
  bytes:Uint8Array;
  signatureBase64:string;
  publicKeyPem:string;
}){
  if(!HEX64.test(args.fingerprint))return false;
  const hash=hex(await crypto.subtle.digest("SHA-256",args.bytes));
  const canonical=[
    "devinx-laser-preview-v1",
    args.deviceId,
    args.fingerprint,
    String(args.sentAt),
    String(args.capturedAt),
    String(args.width),
    String(args.height),
    hash
  ].join("\n");

  try{
    const key=await crypto.subtle.importKey(
      "spki",
      pemSpki(args.publicKeyPem),
      {name:"ECDSA",namedCurve:"P-256"},
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      {name:"ECDSA",hash:"SHA-256"},
      key,
      base64Bytes(args.signatureBase64),
      encoder.encode(canonical)
    );
  }catch{return false}
}
