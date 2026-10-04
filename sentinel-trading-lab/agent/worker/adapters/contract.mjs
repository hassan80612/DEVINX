export class BrokerAdapterContract{
  async connect(){throw new Error('not_implemented')}
  async disconnect(){throw new Error('not_implemented')}
  async getAccountMode(){throw new Error('not_implemented')}
  async getBalance(){throw new Error('not_implemented')}
  async getQuote(){throw new Error('not_implemented')}
  async listAssets(){throw new Error('not_implemented')}
  async placeDemoOrder(){throw new Error('not_implemented')}
  async prepareRealOrder(){throw new Error('not_implemented')}
  async confirmRealOrder(){throw new Error('real_execution_requires_human_confirmation')}
  async health(){return{connected:false,latencyMs:null}}
}
