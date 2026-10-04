export class BrokerAdapterError extends Error{constructor(code,message=code){super(message);this.name='BrokerAdapterError';this.code=code}}
export class BrokerAdapter{
  constructor({name,validated=false}={}){this.name=name||'broker';this.validated=validated;this.connected=false;this.accountMode='demo'}
  async connect(){throw new BrokerAdapterError('not_implemented')}
  async disconnect(){this.connected=false}
  async getStatus(){return{name:this.name,connected:this.connected,validated:this.validated,accountMode:this.accountMode}}
  async getBalance(){throw new BrokerAdapterError('not_implemented')}
  async getQuote(){throw new BrokerAdapterError('not_implemented')}
  async getCandles(){throw new BrokerAdapterError('not_implemented')}
  async placeOrder(){throw new BrokerAdapterError('not_implemented')}
}
export function assertDemoValidation({accountMode,validated}){if(accountMode!=='demo')throw new BrokerAdapterError('demo_validation_required','adapter deve ser validado primeiro em conta Demo');if(!validated)throw new BrokerAdapterError('adapter_not_validated')}
