// A slow broker page must not hold the market evaluation loop. Keep a single
// update in flight and replace the pending frame with the newest snapshot.
export class LatestOverlayScheduler{
  constructor(update){this.update=update;this.pending=null;this.running=false;this.errors=0;}
  publish(provider,data){this.pending={provider,data};if(!this.running)void this.flush();}
  async flush(){
    this.running=true;
    try{while(this.pending){const frame=this.pending;this.pending=null;try{await this.update(frame.provider,frame.data);}catch{this.errors++;}}}
    finally{this.running=false;}
  }
}
