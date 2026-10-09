// Protect the broker chart: at most one overlay update in flight, coalesce
// superseded frames, and give the page breathing room after a slow render.
// There must never be a catch-up loop when Playwright/page.evaluate stalls.
export class LatestOverlayScheduler{
  constructor(update,{minIntervalMs=1200,slowThresholdMs=800,slowCooldownMs=3000}={}){
    this.update=update;this.pending=null;this.running=false;this.errors=0;
    this.minIntervalMs=minIntervalMs;this.slowThresholdMs=slowThresholdMs;
    this.slowCooldownMs=slowCooldownMs;this.nextAllowedAt=0;this.timer=null;
  }
  publish(provider,data){this.pending={provider,data};this.schedule()}
  schedule(){
    if(this.running||this.timer||!this.pending)return;
    const delay=Math.max(0,this.nextAllowedAt-Date.now());
    this.timer=setTimeout(()=>{this.timer=null;void this.flush()},delay);
    this.timer.unref?.();
  }
  async flush(){
    if(this.running||!this.pending)return;
    this.running=true;
    const frame=this.pending;this.pending=null;
    const began=Date.now();
    try{await this.update(frame.provider,frame.data)}
    catch{this.errors++}
    finally{
      const slow=Date.now()-began>=this.slowThresholdMs;
      this.nextAllowedAt=Date.now()+(slow?this.slowCooldownMs:this.minIntervalMs);
      this.running=false;
      this.schedule();
    }
  }
}
