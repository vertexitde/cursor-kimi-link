// What the Kimi Code CLI offered over ACP on November 20, 2026, as a fixed
// catalog for checks.
import {catalogFrom} from '../../models.mjs';

const levels = values => values.map(value => ({value}));
export const sampleModels = [
  {value:'kimi-code/k3.1-pro', name:'K3.1 Pro', thinking:levels(['low', 'high', 'max']), defaultThinking:'high'},
  {value:'kimi-code/k3.1-pro-highspeed', name:'K3.1 Pro Highspeed 2x Usage Cost', thinking:levels(['low', 'high', 'max']), defaultThinking:'high'},
  {value:'kimi-code/k3', name:'K3', thinking:levels(['low', 'high', 'max']), defaultThinking:'high'},
  {value:'kimi-code/k3-256k', name:'K3-256k', thinking:levels(['low', 'high', 'max']), defaultThinking:'high'},
  {value:'kimi-code/kimi-for-coding', name:'K2.8 Preview', thinking:levels(['low', 'high', 'max']), defaultThinking:'max'},
  {value:'kimi-code/kimi-for-coding-highspeed', name:'K2.7 Code Highspeed', thinking:levels(['on', 'max'])}];
const contexts = {'kimi-code/k3-256k':262144, 'kimi-code/kimi-for-coding-highspeed':262144};
export const sampleCatalog = catalogFrom(sampleModels, {contextOf:alias => contexts[alias] ?? 1048576});
