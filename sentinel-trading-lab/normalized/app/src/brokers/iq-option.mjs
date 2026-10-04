import {BrokerAdapter,BrokerAdapterError} from './base.mjs';
export class IQOptionBrowserAdapter extends BrokerAdapter{
  constructor(opts={}){super({name:'iq_option',validated:false});this.sessionRef=opts.sessionRef||null;this.accountMode='demo'}
  async connect(){throw new BrokerAdapterError('iq_option_demo_session_not_validated','IQ Option exige validação de uma sessão Demo real antes de habilitar automação')}
  async placeOrder(){throw new BrokerAdapterError('iq_option_execution_locked','execução IQ Option permanece bloqueada até validação Demo')}
}
