// Protect the broker chart: at most one overlay update in flight, coalesce
// superseded frames, and give the page breathing room after a slow render.
// There must never be a catch-up loop when Playwright/page.evaluate stalls.
export class LatestOverlayScheduler{
  constructor(update,{minIntervalMs=1200,slowThresholdMs=800,slowCooldownMs=3000}={}){
    this.update=update;this.pending=null;this.running=false;this.errors=0;
    this.minIntervalMs=minIntervalMs;this.slowThresholdMs=slowThresholdMs;
    this.slowCooldownMs=slowCooldownMs;this.nextAllowedAt=0;this.timer=null;
    this.renderCount=0;this.slowCount=0;this.lastRenderMs=0;this.averageRenderMs=0;this.coalescedFrames=0;
    this.lastCompleteAt=0;this.urgentRenderCount=0;
  }
  publish(provider,data,{urgent=false}={}){
    if(this.pending)this.coalescedFrames++;
    // Preserve priority when an updated quote supersedes a pending CALL/PUT.
    this.pending={provider,data,urgent:urgent===true||this.pending?.urgent===true};
    this.schedule();
  }
  schedule(){
    if(this.running||!this.pending)return;
    // An actual decision transition may bypass the long cooldown of a
    // previous SLOW drawing. It never interrupts an in-flight page.evaluate.
    if(this.timer){
      if(!this.pending.urgent)return;
      clearTimeout(this.timer);this.timer=null;
    }
    const readyAt=this.pending.urgent?
      Math.max(Date.now(),this.lastCompleteAt+200):this.nextAllowedAt;
    const delay=Math.max(0,readyAt-Date.now());
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
      const elapsed=Date.now()-began,slow=elapsed>=this.slowThresholdMs;
      this.renderCount++;this.lastRenderMs=elapsed;
      if(frame.urgent)this.urgentRenderCount++;
      this.lastCompleteAt=Date.now();
      this.averageRenderMs=Math.round(this.averageRenderMs?this.averageRenderMs*.8+elapsed*.2:elapsed);
      if(slow)this.slowCount++;
      this.nextAllowedAt=Date.now()+(slow?this.slowCooldownMs:this.minIntervalMs);
      this.running=false;
      this.schedule();
    }
  }
  metrics(){return{
    lastRenderMs:this.lastRenderMs,averageRenderMs:this.averageRenderMs,
    renderCount:this.renderCount,slowCount:this.slowCount,urgentRenderCount:this.urgentRenderCount,
    coalescedFrames:this.coalescedFrames,errors:this.errors,
    pending:this.pending!=null,running:this.running
  }}
}
