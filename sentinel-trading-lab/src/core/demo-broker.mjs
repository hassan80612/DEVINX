export class DemoBrokerAdapter{
  constructor({balance=10000,payout=.82}={}){this.balance=balance;this.payout=payout;this.connected=true;this.orders=[]}
  async connect(){this.connected=true;return{connected:true}}
  async disconnect(){this.connected=false;return{connected:false}}
  async getBalance(){return this.balance}
  async getStatus(){return{connected:this.connected,mode:'demo',balance:this.balance,openOrders:this.orders.filter(x=>x.status==='open').length}}
  async listOrders(){return this.orders.map(x=>({...x}))}
  async placeOrder(order){if(!this.connected)throw new Error('broker_disconnected');const id=`demo_${Date.now()}_${this.orders.length+1}`;const row={id,status:'open',...order,openedAt:new Date().toISOString()};this.orders.push(row);return row}
  settle(id,won){const o=this.orders.find(x=>x.id===id);if(!o||o.status!=='open')throw new Error('order_not_open');o.status='closed';o.won=!!won;o.pnl=won?o.amount*this.payout:-o.amount;this.balance+=o.pnl;o.closedAt=new Date().toISOString();return{...o}}
}
export class DisabledRealBrokerAdapter{
  constructor(name='REAL'){this.name=name;this.connected=false}
  async connect(){return{connected:false,reason:'adapter real ainda não validado'}}
  async getStatus(){return{connected:false,mode:'real',validated:false,reason:'adapter real ainda não validado'}}
  async getBalance(){return 0}
  async listOrders(){return[]}
  async placeOrder(){throw new Error('real_execution_disabled')}
}
