// Each companion prepends a picker helper: cursor-gpt-link and
// cursor-claude-link a two-provider one, cursor-mercury-link replaces those
// with three providers and cursor-gemini-link with four. Every copy is
// executed, so redefining it would be overwritten by the copies that run after
// ours; replace each copy with this five-provider superset instead.
import {insertListSections} from './section-list.mjs';

export const legacyPickerSectionHelpersSrc='var __withSubscriptionPickerSections=function(g){const claude=[],chatgpt=[];const rest=function(list){const out=[];for(const m of list||[]){const n=m&&m.name;if(typeof n==="string"&&n.startsWith("claude-subscription/"))claude.push(m);else if(typeof n==="string"&&n.startsWith("chatgpt-codex/"))chatgpt.push(m);else out.push(m)}return out};return{leading:rest(g.leading),promoted:rest(g.promoted),others:rest(g.others),claude,chatgpt}};';

export const mercuryPickerSectionHelpersSrc='var __withSubscriptionPickerSections=function(g){const claude=[],chatgpt=[],mercury=[];const rest=function(list){const out=[];for(const m of list||[]){const n=m&&m.name;if(typeof n==="string"&&n.startsWith("claude-subscription/"))claude.push(m);else if(typeof n==="string"&&n.startsWith("chatgpt-codex/"))chatgpt.push(m);else if(typeof n==="string"&&n.startsWith("inception-mercury/"))mercury.push(m);else out.push(m)}return out};return{leading:rest(g.leading),promoted:rest(g.promoted),others:rest(g.others),claude,chatgpt,mercury}};';

export const antigravityPickerSectionHelpersSrc='var __withSubscriptionPickerSections=function(g){const claude=[],chatgpt=[],mercury=[],antigravity=[];const rest=function(list){const out=[];for(const m of list||[]){const n=m&&m.name;if(typeof n==="string"&&n.startsWith("claude-subscription/"))claude.push(m);else if(typeof n==="string"&&n.startsWith("chatgpt-codex/"))chatgpt.push(m);else if(typeof n==="string"&&n.startsWith("inception-mercury/"))mercury.push(m);else if(typeof n==="string"&&n.startsWith("antigravity/"))antigravity.push(m);else out.push(m)}return out};return{leading:rest(g.leading),promoted:rest(g.promoted),others:rest(g.others),claude,chatgpt,mercury,antigravity}};';

export const pickerSectionHelpersSrc='var __withSubscriptionPickerSections=function(g){const claude=[],chatgpt=[],mercury=[],antigravity=[],kimi=[];const rest=function(list){const out=[];for(const m of list||[]){const n=m&&m.name;if(typeof n==="string"&&n.startsWith("claude-subscription/"))claude.push(m);else if(typeof n==="string"&&n.startsWith("chatgpt-codex/"))chatgpt.push(m);else if(typeof n==="string"&&n.startsWith("inception-mercury/"))mercury.push(m);else if(typeof n==="string"&&n.startsWith("antigravity/"))antigravity.push(m);else if(typeof n==="string"&&n.startsWith("kimi/"))kimi.push(m);else out.push(m)}return out};return{leading:rest(g.leading),promoted:rest(g.promoted),others:rest(g.others),claude,chatgpt,mercury,antigravity,kimi}};';

export function withSubscriptionPickerSections(g) {
  return new Function(pickerSectionHelpersSrc + 'return __withSubscriptionPickerSections;')()(g);
}

// 3.24 and 3.25 list the sections in a memoized fragment that is rebuilt only
// when one of its memo slots changes. The companions write one condition that
// rebuilds it while their sections exist; Kimi adds its own bucket to it, or
// writes it when alone.
export const compiledRebuild = modelsVar =>
  `${modelsVar}.chatgpt?.length||${modelsVar}.claude?.length||${modelsVar}.mercury?.length||${modelsVar}.antigravity?.length||${modelsVar}.kimi?.length||`;

export function compiledSectionsParts(sectionsReturn) {
  const match = sectionsReturn.match(/^return (.+)\?\(([\w$]+)=([\w$]+)\(([\w$]+),\{children:\[([\w$]+),([\w$]+),([\w$]+),([\w$]+)\]\}\)$/);
  if (!match) throw new Error('Unrecognised picker sections fragment: ' + sectionsReturn.slice(0, 100));
  const [, condition, result, fragment, component, leading, promoted, pinned, others] = match;
  return {condition, result, fragment, component, leading, promoted, pinned, others};
}

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function insertCompiledSection(source, once, {modelsVar, sectionsReturn}, section) {
  const parts = compiledSectionsParts(sectionsReturn);
  // A companion's condition is a run of "<models>.<bucket>?.length||" terms.
  const existing = source.match(new RegExp('return ((?:' + escapeRegex(modelsVar) + '\\.[a-z]+\\?\\.length\\|\\|)+)' + escapeRegex(parts.condition) + '\\?\\('));
  if (existing && !existing[1].includes(modelsVar + '.kimi?.length||'))
    source = once(source, 'return ' + existing[1] + parts.condition + '?(', 'return ' + existing[1] + modelsVar + '.kimi?.length||' + parts.condition + '?(');
  else if (!existing)
    source = once(source, `return ${parts.condition}?(${parts.result}=`, `return ${compiledRebuild(modelsVar)}${parts.condition}?(${parts.result}=`);
  // The list ends in the promoted, pinned and other sections whatever the
  // companions put in front of them. 3.25's Agents Window has a second fragment
  // ending in the same names, so the tail is looked for only after this one.
  const tail = `,${parts.promoted},${parts.pinned},${parts.others}]})`;
  const fragment = `(${parts.result}=${parts.fragment}(${parts.component},{children:[${parts.leading},`;
  const start = source.indexOf(fragment);
  if (start < 0 || source.indexOf(fragment, start + 1) >= 0) throw new Error('Picker sections fragment is missing or not unique');
  const at = source.indexOf(tail, start);
  if (at < 0) throw new Error('Picker sections tail not found');
  return source.slice(0, at) + ',' + section + source.slice(at);
}

export function patchPickerSections(source, once, symbols) {
  const {groupReturn, promotedAnchor, modelsVar, jsx, fmt, renderModel} = symbols;
  let replaced = false;
  for (const older of [legacyPickerSectionHelpersSrc, mercuryPickerSectionHelpersSrc, antigravityPickerSectionHelpersSrc]) {
    if (source.includes(older)) { source = source.split(older).join(pickerSectionHelpersSrc); replaced = true; }
  }
  if (!replaced && !source.includes(pickerSectionHelpersSrc)) source = pickerSectionHelpersSrc + '\n' + source;
  if (!source.includes('__withSubscriptionPickerSections(')) {
    source = once(source, groupReturn, 'return __withSubscriptionPickerSections(' + groupReturn.slice('return '.length) + ')');
  }
  if (!source.includes('"kimi-models"')) {
    const section = modelsVar + '.kimi.length>0&&' + jsx + '(' + fmt + ',{models:' + modelsVar + '.kimi,title:"Kimi Code",renderModel:' + renderModel + '},"kimi-models")';
    source = symbols.sectionLists ? insertListSections(source, group => [`{id:"kimi-models",items:${group}.kimi??[],title:"Kimi Code"}`])
      : promotedAnchor ? once(source, promotedAnchor, section + ',' + promotedAnchor)
      : insertCompiledSection(source, once, symbols, section);
  }
  return source;
}
