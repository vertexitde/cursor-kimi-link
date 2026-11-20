import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {prepareRequest, answerRules, extractAnswer, validateAnswer, infer, discoverModels} from '../kimi.mjs';
import {createBridge, completion, streamChunks} from '../bridge.mjs';
import {sampleCatalog} from '../scripts/checks/sample-models.mjs';

const tools = [{type:'function', function:{name:'read_file', description:'Read a file', parameters:{type:'object', properties:{path:{type:'string'}}, required:['path']}}},
  {type:'function', function:{name:'run_terminal_cmd', parameters:{type:'object'}}}];
const base = {model:'kimi/k3.1-pro', tools, messages:[{role:'system', content:'Be helpful.'}, {role:'user', content:'hi'}]};

test('a request becomes one JSON prompt with instructions, conversation and tools', () => {
  const request = prepareRequest({...base, reasoning_effort:'max', messages:[...base.messages,
    {role:'assistant', content:null, tool_calls:[{id:'c1', type:'function', function:{name:'read_file', arguments:'{"path":"a"}'}}]},
    {role:'tool', tool_call_id:'c1', content:'file body'}]}, sampleCatalog);
  assert.equal(request.model.alias, 'kimi-code/k3.1-pro');
  assert.equal(request.thinking, 'max');
  const payload = JSON.parse(request.prompt.slice(request.prompt.indexOf('\n\n') + 2));
  assert.equal(payload.agentInstructions, 'Be helpful.');
  assert.deepEqual(payload.conversation.map(m => m.role), ['user', 'assistant', 'tool']);
  assert.deepEqual(payload.conversation[1].tool_calls, [{id:'c1', name:'read_file', arguments:'{"path":"a"}'}]);
  assert.match(request.prompt, /Do not use any tools of your own/);
});

test('inline images become ACP image blocks', () => {
  const request = prepareRequest({...base, messages:[{role:'user', content:[{type:'text', text:'look'},
    {type:'image_url', image_url:{url:'data:image/png;base64,iVBORw0KGgo='}}, {type:'image_url', image_url:{url:'https://example.com/x.png'}}]}]}, sampleCatalog);
  assert.deepEqual(request.images, [{type:'image', mimeType:'image/png', data:'iVBORw0KGgo='}]);
  assert.match(request.prompt, /\[Attached image 1\]/);
  assert.match(request.prompt, /Image omitted/);
});

test('the answer rules follow tool_choice and parallel_tool_calls', () => {
  const list = [{name:'a'}, {name:'b'}];
  assert.deepEqual(answerRules({}, list), {names:['a', 'b'], min:0, max:Infinity});
  assert.equal(answerRules({tool_choice:'required'}, list).min, 1);
  assert.equal(answerRules({tool_choice:'none'}, list).max, 0);
  assert.equal(answerRules({parallel_tool_calls:false}, list).max, 1);
  assert.deepEqual(answerRules({tool_choice:{type:'function', function:{name:'b'}}}, list), {names:['b'], min:1, max:Infinity});
});

test('answers are read from plain or fenced JSON and checked against the tools', () => {
  assert.deepEqual(extractAnswer('```json\n{"text":"x","tool_calls":[]}\n```'), {text:'x', tool_calls:[]});
  assert.deepEqual(extractAnswer('Sure: {"text":"x","tool_calls":[]} done'), {text:'x', tool_calls:[]});
  assert.equal(extractAnswer('no json here'), undefined);
  const request = prepareRequest(base, sampleCatalog);
  assert.deepEqual(validateAnswer({text:'x', tool_calls:[{name:'read_file', arguments:{path:'a'}}]}, request), {text:'x', tool_calls:[{name:'read_file', arguments:'{"path":"a"}'}]}, 'object arguments are encoded');
  assert.throws(() => validateAnswer({text:'x', tool_calls:[{name:'rm', arguments:'{}'}]}, request), /unavailable tool/);
  assert.throws(() => validateAnswer({text:'x', tool_calls:[{name:'read_file', arguments:'[1]'}]}, request), /JSON object/);
  assert.throws(() => validateAnswer(undefined, request), /required JSON answer/);
});

// A scripted `kimi acp`: answers the protocol, asks for one permission and
// replies with the given texts, one per prompt.
function fakeKimi(replies, seen) {
  return (command, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    const call = {args, cwd:options.cwd, methods:[], prompts:[], permissionAnswer:undefined};
    seen.push(call);
    const write = message => child.stdout.write(JSON.stringify(message) + '\n');
    let buffer = '';
    child.stdin.on('data', chunk => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const message = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
        if (message.id === 'perm-1') { call.permissionAnswer = message.result; continue; }
        call.methods.push(message.method + (message.params?.configId ? ':' + message.params.configId + '=' + message.params.value : ''));
        const reply = result => write({jsonrpc:'2.0', id:message.id, result});
        if (message.method === 'initialize') reply({protocolVersion:1});
        else if (message.method === 'session/new') reply({sessionId:'s1', configOptions:[{id:'model', options:[{value:'kimi-code/k3.1-pro', name:'K3.1 Pro'}]}]});
        else if (message.method === 'session/set_config_option') reply({configOptions:[{id:'thinking', options:[{value:'low'}, {value:'high'}, {value:'max'}]}]});
        else if (message.method === 'session/prompt') {
          call.prompts.push(message.params.prompt);
          write({jsonrpc:'2.0', id:'perm-1', method:'session/request_permission', params:{sessionId:'s1'}});
          write({jsonrpc:'2.0', method:'session/update', params:{update:{sessionUpdate:'agent_thought_chunk', content:{type:'text', text:'thinking…'}}}});
          write({jsonrpc:'2.0', method:'session/update', params:{update:{sessionUpdate:'agent_message_chunk', content:{type:'text', text:replies.shift()}}}});
          reply({stopReason:'end_turn'});
        } else reply({});
      }
    });
    child.stdin.on('finish', () => setImmediate(() => child.emit('close', 0)));
    child.kill = () => child.stdin.end();
    return child;
  };
}

test('infer drives one Plan-mode session, refuses permissions and cleans up', async () => {
  const seen = [];
  const answer = {text:'', tool_calls:[{name:'read_file', arguments:'{"path":"x"}'}]};
  const out = await infer('kimi.exe', {...base, reasoning_effort:'low'}, sampleCatalog, {spawnProcess:fakeKimi([JSON.stringify(answer)], seen)});
  assert.deepEqual(out.answer, answer);
  const [call] = seen;
  assert.deepEqual(call.args, ['acp']);
  assert.deepEqual(call.methods, ['initialize', 'session/new', 'session/set_config_option:mode=default', 'session/set_config_option:model=kimi-code/k3.1-pro',
    'session/set_config_option:thinking=low', 'session/prompt', 'session/delete']);
  assert.deepEqual(call.permissionAnswer, {outcome:{outcome:'cancelled'}});
  assert.equal(call.prompts[0][0].type, 'text');
  assert.equal(fs.existsSync(call.cwd), false, 'the working folder is removed');
  assert.equal(out.usage.estimated, true);
});

test('a reply that is not the JSON answer gets one correction round', async () => {
  const seen = [];
  const out = await infer('kimi.exe', base, sampleCatalog, {spawnProcess:fakeKimi(['Klar, mache ich.', '{"text":"Fertig.","tool_calls":[]}'], seen)});
  assert.equal(out.answer.text, 'Fertig.');
  assert.equal(seen[0].prompts.length, 2);
  assert.match(seen[0].prompts[1][0].text, /did not follow the required format/);
  await assert.rejects(infer('kimi.exe', base, sampleCatalog, {spawnProcess:fakeKimi(['nope', 'still nope'], [])}), /required JSON answer/);
});

test('model discovery reads each model and its thinking levels over ACP', async () => {
  const catalog = await discoverModels('kimi.exe', {spawnProcess:fakeKimi([], [])});
  assert.deepEqual(catalog.map(m => [m.id, m.efforts.join('/')]), [['k3.1-pro', 'low/high/max']]);
});

test('completions carry text, tool calls and usage in OpenAI shape, streamed or not', () => {
  const result = completion(base, {text:'Reading it.', tool_calls:[{name:'read_file', arguments:'{"path":"x"}'}]}, {input_tokens:100, output_tokens:5, thinking_tokens:7});
  assert.equal(result.choices[0].finish_reason, 'tool_calls');
  assert.match(result.choices[0].message.tool_calls[0].id, /^call_[0-9a-f]{24}$/);
  assert.equal(result.usage.completion_tokens, 12);
  const chunks = streamChunks({...base, stream_options:{include_usage:true}}, result);
  assert.deepEqual(chunks.map(c => Object.keys(c.choices[0]?.delta ?? {usage:1})), [['role'], ['content'], ['tool_calls'], [], ['usage']]);
});

async function withBridge(options, run) {
  const server = createBridge({bridgeKey:'k', kimi:'kimi.exe', catalog:sampleCatalog, ...options});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run('http://127.0.0.1:' + server.address().port); } finally { server.close(); }
}

test('the bridge requires its key, lists the models and answers chat completions', async () => {
  const inferImpl = async (kimi, body) => {
    if (body.messages[0].content === 'fail') throw Object.assign(new Error('Kimi: quota exhausted'), {status:502, code:'kimi_rpc_error'});
    return {answer:{text:'Hallo', tool_calls:[]}, usage:{input_tokens:1, output_tokens:1}};
  };
  await withBridge({inferImpl}, async url => {
    assert.equal((await fetch(url + '/v1/models')).status, 401);
    const models = await (await fetch(url + '/v1/models', {headers:{authorization:'Bearer k'}})).json();
    assert.deepEqual(models.data.map(m => m.id), sampleCatalog.map(m => 'kimi/' + m.id));
    const post = body => fetch(url + '/v1/chat/completions', {method:'POST', headers:{authorization:'Bearer k'}, body:JSON.stringify(body)});
    assert.equal((await (await post({model:'kimi/k3.1-pro', messages:[{role:'user', content:'hi'}]})).json()).choices[0].message.content, 'Hallo');
    assert.match(await (await post({model:'kimi/k3.1-pro', stream:true, messages:[{role:'user', content:'hi'}]})).text(), /"content":"Hallo"[\s\S]*data: \[DONE\]/);
    const failed = await post({model:'kimi/k3.1-pro', messages:[{role:'user', content:'fail'}]});
    assert.equal(failed.status, 502);
    assert.match((await failed.json()).error.message, /quota/);
  });
});
