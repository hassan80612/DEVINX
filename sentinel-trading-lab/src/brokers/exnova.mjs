import {BrokerAdapter,BrokerAdapterError} from './base.mjs';
export class ExnovaBrowserAdapter extends BrokerAdapter{
  constructor(opts={}){super({name:'exnova',validated:false});this.sessionRef=opts.sessionRef||null;this.accountMode='demo'}
  async connect(){throw new BrokerAdapterError('exnova_demo_session_not_validated','Exnova exige validação de uma sessão Demo real antes de habilitar automação')}
  async placeOrder(){throw new BrokerAdapterError('exnova_execution_locked','execução Exnova permanece bloqueada até validação Demo')}
}
