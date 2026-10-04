function clean(url){return String(url||'').replace(/\/$/,'')}
export class HttpBrowserDriver{
  constructor({baseUrl,token,timeoutMs=12_000}={}){this.baseUrl=clean(baseUrl);this.token=token||'';this.timeoutMs=timeoutMs}
  get available(){return !!this.baseUrl}
  async call(provider,action,{method='POST',body}={}){
    if(!this.available)throw new Error('browser_driver_not_configured');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try{
      const headers={'content-type':'application/json'};if(this.token)headers.authorization=`Bearer ${this.token}`;
      const res=await fetch(`${this.baseUrl}/brokers/${provider}/${action}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
      const out=await res.json().catch(()=>({}));if(!res.ok||out?.ok===false)throw new Error(out?.error||`driver_http_${res.status}`);return out?.data??out;
    }finally{clearTimeout(timer)}
  }
}
