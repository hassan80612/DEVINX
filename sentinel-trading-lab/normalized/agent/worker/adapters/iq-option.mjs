import {BrowserBrokerAdapter} from './browser-broker.mjs';
export class IqOptionAdapter extends BrowserBrokerAdapter{constructor(opts={}){super({provider:'iq_option',...opts})}}
