export class SimulatedFeed{
  constructor({seed=42,start=100}={}){this.seed=seed>>>0;this.price=start;this.candles=[];this.ts=Date.now()}
  rand(){this.seed=(1664525*this.seed+1013904223)>>>0;return this.seed/4294967296}
  tick(atMs=this.ts+60000){const open=this.price,drift=(this.rand()-.49)*.8,close=Math.max(.00001,open+drift),high=Math.max(open,close)+this.rand()*.35,low=Math.max(.00001,Math.min(open,close)-this.rand()*.35);this.price=close;this.ts=Math.max(this.ts+1,Number(atMs));const c={ts:this.ts,open,high,low,close};this.candles.push(c);if(this.candles.length>500)this.candles.shift();return c}
  warmup(n=80){const end=Date.now();this.ts=end-Math.max(0,n)*60000;for(let i=0;i<n;i++)this.tick(this.ts+60000);return this.candles}
  snapshot(){return{candles:[...this.candles],quoteTs:this.ts,price:this.price,source:'SIMULATED'}}
}
