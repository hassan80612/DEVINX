// Coalesce bursts while guaranteeing that the last received quote is evaluated.
export class LatestQuoteScheduler {
  constructor({evaluate,isBusy=()=>false,isRunning=()=>true,intervalMs=200}) {
    Object.assign(this,{evaluate,isBusy,isRunning,intervalMs});this.pending=false;this.timer=null;this.lastAt=0;this.evaluating=false;
  }
  request(){this.pending=true;this.schedule();}
  schedule(){if(this.timer||this.evaluating||!this.pending)return;this.timer=setTimeout(()=>this.flush(),Math.max(0,this.intervalMs-(Date.now()-this.lastAt)));this.timer.unref?.();}
  async flush(){this.timer=null;if(!this.isRunning()){this.pending=false;return;}if(this.isBusy()){this.timer=setTimeout(()=>this.flush(),20);this.timer.unref?.();return;}
    this.pending=false;this.evaluating=true;this.lastAt=Date.now();try{await this.evaluate();}finally{this.evaluating=false;this.schedule();}
  }
  close(){clearTimeout(this.timer);this.timer=null;this.pending=false;}
}
