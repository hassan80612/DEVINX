export type HeartbeatEnvelope={
  version:number;
  agentVersion:string;
  deviceId:string;
  publicKeyFingerprint:string;
  sequence:number;
  sentAt:number;
  telemetryBase64:string;
  signatureBase64:string;
};

export type HeartbeatTelemetry={
  protocolVersion:number;
  deviceId:string;
  publicKeyFingerprint:string;
  adapter:"lightburn-rest"|"lightburn-udp-legacy";
  lightBurnOnline:boolean;
  deviceConnected:boolean;
  deviceName:string|null;
  jobState:"unknown"|"idle"|"running"|"paused"|"busy";
  progress:number|null;
  projectFile:string|null;
  capturedAtUtc:string;
};

const encoder=new TextEncoder();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64=/^[0-9a-f]{64}$/;

export function heartbeatJson(body:unknown,status=200){
  return Response.json(body,{
    status,
    headers:{
      "Cache-Control":"no-store, max-age=0",
      "X-Content-Type-Options":"nosniff"
    }
  });
}

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

function toHex(bytes:ArrayBuffer|Uint8Array){
  const a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  return Array.from(a,b=>b.toString(16).padStart(2,"0")).join("");
}

export function validateHeartbeatEnvelope(e:HeartbeatEnvelope){
  if(e.version!==1)return "protocol_version";
  if(typeof e.agentVersion!=="string"||e.agentVersion.length<1||e.agentVersion.length>40)return "agent_version";
  if(!UUID.test(e.deviceId))return "device_id";
  if(!HEX64.test(e.publicKeyFingerprint))return "fingerprint";
  if(!Number.isSafeInteger(e.sequence)||e.sequence<1)return "sequence";
  if(!Number.isSafeInteger(e.sentAt))return "sent_at";
  if(Math.abs(Math.floor(Date.now()/1000)-e.sentAt)>90)return "clock_skew";
  if(typeof e.telemetryBase64!=="string"||e.telemetryBase64.length<4||e.telemetryBase64.length>22000)return "telemetry";
  if(typeof e.signatureBase64!=="string"||e.signatureBase64.length<60||e.signatureBase64.length>128)return "signature";
  return null;
}

export async function decodeHeartbeatTelemetry(envelope:HeartbeatEnvelope){
  let bytes:Uint8Array;
  try{bytes=base64Bytes(envelope.telemetryBase64)}catch{return {error:"telemetry_encoding" as const}}
  if(bytes.byteLength>16000)return {error:"telemetry_too_large" as const};

  let telemetry:HeartbeatTelemetry;
  try{telemetry=JSON.parse(new TextDecoder().decode(bytes)) as HeartbeatTelemetry}
  catch{return {error:"telemetry_json" as const}}

  if(telemetry.protocolVersion!==1)return {error:"telemetry_protocol" as const};
  if(telemetry.deviceId!==envelope.deviceId)return {error:"telemetry_device" as const};
  if(telemetry.publicKeyFingerprint!==envelope.publicKeyFingerprint)return {error:"telemetry_fingerprint" as const};
  if(telemetry.adapter!=="lightburn-rest"&&telemetry.adapter!=="lightburn-udp-legacy")return {error:"telemetry_adapter" as const};
  if(!["unknown","idle","running","paused","busy"].includes(telemetry.jobState))return {error:"telemetry_job_state" as const};
  if(typeof telemetry.lightBurnOnline!=="boolean"||typeof telemetry.deviceConnected!=="boolean")return {error:"telemetry_boolean" as const};
  if(telemetry.progress!==null&&(typeof telemetry.progress!=="number"||!Number.isFinite(telemetry.progress)||telemetry.progress<0||telemetry.progress>100))return {error:"telemetry_progress" as const};
  if(telemetry.deviceName!==null&&(typeof telemetry.deviceName!=="string"||telemetry.deviceName.length>160))return {error:"telemetry_device_name" as const};
  if(telemetry.projectFile!==null&&(typeof telemetry.projectFile!=="string"||telemetry.projectFile.length>500))return {error:"telemetry_project" as const};

  const captured=Date.parse(telemetry.capturedAtUtc);
  if(!Number.isFinite(captured)||captured<Date.now()-5*60*1000||captured>Date.now()+60*1000)return {error:"telemetry_captured_at" as const};

  return {telemetry,bytes};
}

export async function verifyHeartbeatSignature(
  envelope:HeartbeatEnvelope,
  publicKeyPem:string,
  telemetryBytes:Uint8Array
){
  const telemetryHash=toHex(await crypto.subtle.digest("SHA-256",telemetryBytes));
  const canonical=[
    "devinx-laser-heartbeat-v1",
    envelope.deviceId,
    envelope.publicKeyFingerprint,
    envelope.agentVersion,
    String(envelope.sequence),
    String(envelope.sentAt),
    telemetryHash
  ].join("\n");

  try{
    const key=await crypto.subtle.importKey(
      "spki",
      pemSpki(publicKeyPem),
      {name:"ECDSA",namedCurve:"P-256"},
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      {name:"ECDSA",hash:"SHA-256"},
      key,
      base64Bytes(envelope.signatureBase64),
      encoder.encode(canonical)
    );
  }catch{
    return false;
  }
}
