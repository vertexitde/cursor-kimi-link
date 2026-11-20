import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {modelTooltip} from './model-tooltip.mjs';

export const prefix = 'kimi/';
// Kimi's own model aliases carry this provider prefix; Cursor sees kimi/<id>.
export const kimiProvider = 'kimi-code/';

// The models come from the Kimi Code CLI over ACP: session/new lists them as
// the "model" option and switching to one lists its "thinking" levels. The
// context window is not part of ACP, so it is read from the CLI's own
// config.toml (no credentials live there) and falls back to 256K.
export function catalogFrom(models, {contextOf = contextFromConfig()} = {}) {
  return models.map(({value, name, thinking = [], defaultThinking}) => {
    const id = value.startsWith(kimiProvider) ? value.slice(kimiProvider.length) : value;
    const efforts = thinking.map(option => option.value ?? option);
    return {id, alias:value, name, efforts, defaultEffort:pickDefault(efforts, defaultThinking),
      contextLength:contextOf(value) ?? 262144, maxOutputTokens:32768, summary:summaryFor(id, name)};
  });
}

function pickDefault(efforts, configured) {
  if (configured && efforts.includes(configured)) return configured;
  return ['high', 'on', 'max', 'low'].find(effort => efforts.includes(effort)) ?? efforts[0];
}

export function kimiHome() {
  return process.env.KIMI_CODE_HOME || path.join(os.homedir(), '.kimi-code');
}

// Reads max_context_size and default_effort per model alias from config.toml.
export function readModelConfig(file = path.join(kimiHome(), 'config.toml')) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return {}; }
  const out = {};
  let current;
  for (const line of text.split(/\r?\n/)) {
    const header = line.match(/^\s*\[models\."([^"]+)"\]\s*$/);
    if (header) { current = out[header[1]] = {}; continue; }
    if (/^\s*\[/.test(line)) { current = undefined; continue; }
    const value = current && line.match(/^\s*(max_context_size|default_effort)\s*=\s*"?([^"\s]+)"?\s*$/);
    if (value) current[value[1]] = value[1] === 'max_context_size' ? Number(value[2]) : value[2];
  }
  return out;
}

function contextFromConfig() {
  const config = readModelConfig();
  return alias => config[alias]?.max_context_size;
}

export function defaultEffortsFromConfig() {
  const config = readModelConfig();
  return alias => config[alias]?.default_effort;
}

function summaryFor(id, name) {
  if (/highspeed/.test(id)) return name + ': the faster Kimi variant; it counts more against your Kimi Code quota.';
  if (/^k3\.1/.test(id)) return 'Moonshot\'s newest Kimi model for coding and agent work, through your Kimi Code membership.';
  if (/^k3/.test(id)) return 'Kimi K3 through your Kimi Code membership, for agentic coding with long context.';
  return name + ' through your Kimi Code membership.';
}

const effortNames = {low:'Low', medium:'Medium', high:'High', max:'Max', on:'On', off:'Off'};
const effortName = value => effortNames[value] ?? value[0].toUpperCase() + value.slice(1);

// The level the bridge sets for a request: the one chosen in the picker, or
// the closest one the model offers.
export function thinkingFor(model, effort) {
  if (!model.efforts.length) return undefined;
  if (model.efforts.includes(effort)) return effort;
  const near = {none:['low', 'on'], minimal:['low', 'on'], instant:['low', 'on'], low:['low', 'on'], medium:['high', 'on'], high:['high', 'on'], xhigh:['max', 'high'], max:['max', 'high']}[effort] ?? [];
  return near.find(candidate => model.efforts.includes(candidate)) ?? model.defaultEffort;
}

// The Kimi mark from LobeHub Icons (MIT); it follows the picker's text colour.
// The picker keeps line breaks in labels, so the markup must be a single line.
const kimiIcon = fs.readFileSync(new URL('./kimi.svg', import.meta.url), 'utf8').trim()
  .replace(/>\s+</g, '><').replace(/\s+/g, ' ').replace(/<title>[^<]*<\/title>/, '')
  .replace(/^<svg ([^>]*)>/, (_, attributes) => '<svg ' + attributes.replace(/\s*(?:width|height|style)="[^"]*"/g, '') +
    ' width="12" height="12" aria-hidden="true" style="display:inline-block;vertical-align:-2px;margin-right:6px;flex:none">');

const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function findModel(catalog, id) {
  return catalog.find(model => model.id === id);
}

export function pickerModels(catalog) {
  return catalog.map(model => {
    const id = prefix + model.id, name = model.name, available = model.efforts, chosen = model.defaultEffort;
    const tooltip = effort => modelTooltip(name, model.summary, model.contextLength, effort);
    const label = effort => kimiIcon + escape(name) + (effort ? ' <span style="color: var(--cursor-text-tertiary);">' + effortName(effort) + '</span>' : '');
    return {name:id, serverModelName:id, clientDisplayName:name, inputboxShortModelName:name,
      defaultOn:true, supportsAgent:true, supportsImages:true, supportsThinking:true,
      supportsNonMaxMode:true, supportsMaxMode:false, supportsPlanMode:true, supportsAutoContext:true,
      contextTokenLimit:model.contextLength, contextTokenLimitForMaxMode:model.contextLength, autoContextMaxTokens:model.contextLength,
      namedModelSectionIndex:0, vendorName:'moonshot', vendor:{id:0, displayName:'Kimi'},
      modelPickerBadges:[], cloudAgentEffortModes:[], tagline:model.summary, tooltipData:tooltip(chosen),
      parameterDefinitions:available.length ? [{id:'reasoning', name:'Thinking', isCycleableByHotkey:true,
        markdownTooltip:'How much Kimi thinks before answering. Max thinks longest and uses the most of your Kimi Code quota.',
        parameterType:{enumParameter:{values:available.map(value => ({value, displayName:effortName(value), modelPickerBadges:[]}))}}}] : [],
      variants:(available.length ? available : [undefined]).map(effort => ({
        parameterValues:effort ? [{id:'reasoning', value:effort}] : [],
        displayName:label(effort),
        displayNameOutsidePicker:name + (effort ? ' ' + effortName(effort) : ''),
        variantStringRepresentation:id + (effort ? '[reasoning=' + effort + ']' : ''),
        // No Max variants. With Max mode on, Cursor looks for the default Max
        // configuration and otherwise falls back to the first variant (Low),
        // so the default level serves both modes.
        isMaxMode:false, isDefaultNonMaxConfig:effort === chosen, isDefaultMaxConfig:effort === chosen,
        tagline:model.summary, tooltipData:tooltip(effort)})),
      legacySlugs:[], idAliases:[]};
  });
}

// Served to Cursor's local agent runtime from GET /v1/models. The runtime only
// trusts these fields when tool use, streaming and text output are declared.
export function providerModels(catalog) {
  return catalog.map(model => ({id:prefix + model.id, object:'model', owned_by:'moonshot', api_types:['chat_completions'],
    capabilities:{context_length:model.contextLength, max_output_tokens:model.maxOutputTokens,
      supports_vision:true, supports_reasoning:true, supports_tool_use:true, supports_streaming:true,
      input_modalities:['text', 'image'], output_modalities:['text']}}));
}
