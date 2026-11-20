import test from 'node:test';
import assert from 'node:assert/strict';
import {once, patchRuntime, kimiReasoningBranch, providerConfigBranch} from '../patches.mjs';
import {patchPickerSections, legacyPickerSectionHelpersSrc, mercuryPickerSectionHelpersSrc, antigravityPickerSectionHelpersSrc, pickerSectionHelpersSrc, withSubscriptionPickerSections} from '../picker-sections.mjs';
import {pickerModels, providerModels, thinkingFor, readModelConfig} from '../models.mjs';
import {sampleCatalog} from '../scripts/checks/sample-models.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('anchors must occur exactly once, and replacements are literal', () => {
  assert.throws(() => once('a b a', 'a', 'x'), /2 matches/);
  assert.throws(() => once('abc', 'z', 'x'), /0 matches/);
  assert.equal(once('call(K)', 'K', "$&$'$1$K"), "call($&$'$1$K)");
});

test('picker helper keeps every companion bucket and adds Kimi', () => {
  const groups = withSubscriptionPickerSections({leading:[{name:'kimi/k3.1-pro'}],
    promoted:[{name:'claude-subscription/opus'}, {name:'inception-mercury/mercury-2.5'}, {name:'antigravity/gemini-4-argon'}, {name:'composer'}], others:[{name:'chatgpt-codex/gpt'}]});
  assert.deepEqual(groups.promoted.map(m => m.name), ['composer']);
  assert.deepEqual([groups.claude, groups.chatgpt, groups.mercury, groups.antigravity, groups.kimi].map(list => list.length), [1, 1, 1, 1, 1]);
});

const picker = {groupReturn:'return c.x?{a:1}:{a:2}', promotedAnchor:'HP(f,{models:B.promoted,title:c?.t', modelsVar:'B', jsx:'HP', fmt:'f', renderModel:'x'};
test('replaces the two-, three- and four-provider helper copies instead of redefining them', () => {
  const combined = [legacyPickerSectionHelpersSrc, mercuryPickerSectionHelpersSrc, antigravityPickerSectionHelpersSrc].join('\n') +
    '\nreturn __withSubscriptionPickerSections(c.x?{a:1}:{a:2});B.antigravity.length>0&&HP(f,{},"antigravity-models"),HP(f,{models:B.promoted,title:c?.t';
  const out = patchPickerSections(combined, once, picker);
  for (const older of [legacyPickerSectionHelpersSrc, mercuryPickerSectionHelpersSrc, antigravityPickerSectionHelpersSrc]) assert.equal(out.split(older).length, 1);
  assert.equal(out.split(pickerSectionHelpersSrc).length, 4);
  assert.ok(out.includes('"antigravity-models"),B.kimi.length>0&&HP(f,{models:B.kimi,title:"Kimi Code",renderModel:x},"kimi-models"),HP(f,{models:B.promoted'));
});

test('provider branch points Kimi models at the bridge without provider headers', async () => {
  const branch = providerConfigBranch('t?.requestedModel?.modelId??e?.modelId');
  const config = new Function('__isKimiModel', '__kimiBridgeBase', '__kimiBridgeKey', `return async function(e,t){${branch}return "native"}`)(
    m => typeof m === 'string' && m.startsWith('kimi/'), 'http://127.0.0.1:43191', 'k');
  assert.deepEqual(await config({}, {requestedModel:{modelId:'kimi/k3.1-pro'}}), {baseUrl:'http://127.0.0.1:43191/v1', apiKey:'k', customHeaders:{}});
  assert.equal(await config({modelId:'gpt-5'}, {}), 'native');
});

test('runtime branch sets reasoning_effort for Kimi only', () => {
  const normalizer = 'function(e,t,r,n,o,s=!1,i){const a=function(e){const r=e?.find(p=>p.id==="reasoning")?.value;return void 0===r||""===r||"none"===r?void 0:r}(r);if(void 0===a)return;e.native=a}';
  const source = 'x=' + normalizer + ';const{subagentConfig:t,requestedModel:r,parentModelId:n}=e;';
  assert.throws(() => patchRuntime(source), /anchor is not unique/, 'an incomplete bundle is rejected');
  const patched = once(source, '"none"===r?void 0:r}(r);', '"none"===r?void 0:r}(r);' + kimiReasoningBranch('r'));
  const run = new Function('return (' + patched.slice(2, patched.indexOf(';const{')) + ')')();
  const kimi = {reasoning:{effort:'x'}, service_tier:'priority'};
  run(kimi, 'kimi/k3.1-pro', [{id:'reasoning', value:'max'}]);
  assert.deepEqual(kimi, {reasoning_effort:'max'});
  const other = {};
  run(other, 'gpt-5', [{id:'reasoning', value:'low'}]);
  assert.deepEqual(other, {native:'low'});
});

test('catalog: ids, thinking levels, defaults and context windows', () => {
  assert.deepEqual(sampleCatalog.map(m => m.id), ['k3.1-pro', 'k3.1-pro-highspeed', 'k3', 'k3-256k', 'kimi-for-coding', 'kimi-for-coding-highspeed']);
  const [pro] = sampleCatalog, highspeed = sampleCatalog.at(-1);
  assert.equal(pro.alias, 'kimi-code/k3.1-pro');
  assert.deepEqual(pro.efforts, ['low', 'high', 'max']);
  assert.equal(pro.defaultEffort, 'high');
  assert.equal(pro.contextLength, 1048576);
  assert.equal(sampleCatalog[4].defaultEffort, 'max', 'the default from Kimi config wins');
  assert.equal(thinkingFor(pro, 'max'), 'max');
  assert.equal(thinkingFor(pro, 'medium'), 'high', 'closest level the model offers');
  assert.equal(thinkingFor(pro, 'xhigh'), 'max');
  assert.equal(thinkingFor(highspeed, 'low'), 'on');
  assert.equal(thinkingFor(highspeed, undefined), 'on', 'default when none was chosen');
});

test('the context window and default level are read from Kimi config.toml', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kimi-config-'));
  try {
    const file = path.join(dir, 'config.toml');
    fs.writeFileSync(file, '[models."kimi-code/k3"]\nprovider = "managed:kimi-code"\nmax_context_size = 1048576\ndefault_effort = "high"\n\n[providers."managed:kimi-code"]\napi_key = ""\n');
    assert.deepEqual(readModelConfig(file), {'kimi-code/k3':{max_context_size:1048576, default_effort:'high'}});
    assert.deepEqual(readModelConfig(path.join(dir, 'missing.toml')), {});
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
});

test('picker and provider catalogs describe image-capable thinking models with the Kimi mark', () => {
  const models = pickerModels(sampleCatalog);
  assert.deepEqual(models.map(m => m.name), sampleCatalog.map(m => 'kimi/' + m.id));
  const [pro] = models, highspeed = models.at(-1);
  assert.equal(pro.supportsImages, true);
  assert.equal(pro.supportsMaxMode, false);
  assert.deepEqual(pro.parameterDefinitions[0].parameterType.enumParameter.values.map(v => [v.value, v.displayName]), [['low', 'Low'], ['high', 'High'], ['max', 'Max']]);
  assert.deepEqual(pro.variants.filter(v => v.isDefaultNonMaxConfig).map(v => v.parameterValues[0].value), ['high']);
  assert.deepEqual(highspeed.variants.map(v => v.parameterValues[0].value), ['on', 'max']);
  for (const model of models) {
    const label = model.variants[0].displayName;
    assert.ok(label.startsWith('<svg ') && label.includes(' width="12" height="12"') && label.includes('fill="currentColor"'), 'Kimi icon follows the text colour');
    assert.ok(!label.includes('1em') && !/[\r\n]/.test(label));
  }
  assert.deepEqual(providerModels(sampleCatalog).map(m => m.capabilities.context_length), [1048576, 1048576, 1048576, 262144, 1048576, 262144]);
});

test('Max mode keeps the chosen Kimi level', async () => {
  const {kimiVariant, patchMaxMode} = await import('../max-mode.mjs');
  const [model] = pickerModels(sampleCatalog);
  for (const effort of ['low', 'high', 'max'])
    assert.equal(kimiVariant(model, [{id:'reasoning', value:effort}]).parameterValues[0].value, effort);
  const solver = 'function J4g(e,t,n){if(e.variants.length===0||!n&&e.supportsNonMaxMode===!1)return;return"native"}';
  const solve = new Function('__isKimiModel', patchMaxMode(solver) + ';return J4g')(name => name.startsWith('kimi/'));
  assert.equal(solve(model, [{id:'reasoning', value:'max'}], true).parameters[0].value, 'max');
  assert.equal(solve({...model, name:'gpt-5'}, [], true), 'native');
});
