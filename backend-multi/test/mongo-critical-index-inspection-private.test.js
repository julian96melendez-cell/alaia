'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { spawnSync } = require('node:child_process');
const path = require('node:path'), fs = require('node:fs');
const wrapper = require('../scripts/mongo-critical-index-inspection-private');
const inspector = require('../scripts/mongo-critical-index-inspector');
const secret = 'SYNTHETIC_PRIVATE_PASSWORD';
const sensitive = 'mongodb+srv://fixture:SYNTHETIC_PRIVATE_PASSWORD@fixture.mongodb.net/backendmulti SENSITIVE_DRIVER_TRACE';
const env = () => ({ ALAIA_INDEX_INSPECTION_PROJECT_ID: '6934caf0d4e66132196bd495', ALAIA_INDEX_INSPECTION_CLUSTER_NAME: 'Cluster0', ALAIA_INDEX_INSPECTION_HOST: 'fixture.mongodb.net', ALAIA_INDEX_INSPECTION_DB: 'backendmulti', ALAIA_INDEX_INSPECTION_CONFIRM: '6934caf0d4e66132196bd495|Cluster0|fixture.mongodb.net|backendmulti|usuarios,counters,webhookevents' });
async function capture(options = {}) {
  let out = '', err = '';
  const code = await wrapper.run({ input: Readable.from([secret]), env: env(), mode: '--inspect', stdout: { write: value => { out += value; } }, stderr: { write: value => { err += value; } }, ...options });
  assert.doesNotMatch(out + err, /SYNTHETIC_PRIVATE|mongodb(?:\+srv)?:\/\/|SENSITIVE_DRIVER_TRACE|\bat .*\.js:/);
  return { code, out, err };
}
function fakeMain(stage) {
  class Client {
    on() {}
    async connect() { if (['authentication', 'connection'].includes(stage)) throw Error(sensitive); }
    async close() { if (stage === 'client_cleanup') throw Error(sensitive); }
    db() { return { databaseName: 'backendmulti', listCollections() { return { async next() { if (stage === 'query') throw Error(sensitive); return null; }, async close() { if (stage === 'cursor_cleanup') throw Error(sensitive); } }; } }; }
  }
  return (config, dependencies) => inspector.main(config, { ...dependencies, loadDriver: () => ({ MongoClient: Client }) });
}
for (const stage of ['authentication', 'connection', 'query', 'cursor_cleanup', 'client_cleanup']) {
  test(stage + ' failures redact both output channels', async () => {
    const result = await capture({ main: fakeMain(stage) });
    assert.equal(result.code, 1); assert.equal(JSON.parse(result.out).status, 'failed');
    if (stage.endsWith('cleanup')) assert.equal(JSON.parse(result.out).cleanup, 'failed');
  });
}
test('preparation rejects inherited settings, destinations, malformed and excessive input before main', async () => {
  for (const patch of [{ NODE_OPTIONS: '' }, { DEBUG: 'sensitive' }, { MONGO_URI: sensitive }, { ALAIA_INDEX_INSPECTION_URI: sensitive }, { ALAIA_INDEX_INSPECTION_DB: 'alaia_consumed' }, { ALAIA_INDEX_INSPECTION_CONFIRM: 'wrong' }, { ALAIA_INDEX_INSPECTION_HOST: 'mongodb+srv://fixture.mongodb.net' }, { ALAIA_INDEX_INSPECTION_HOST: 'fixture.mongodb.net:27017' }, { ALAIA_INDEX_INSPECTION_HOST: 'fixture.mongodb.net/path' }]) {
    const result = await capture({ env: { ...env(), ...patch }, main() { assert.fail('must not call main'); } });
    assert.equal(result.code, 1); assert.equal(JSON.parse(result.err).stage, 'preparation');
  }
  for (const password of ['', 'a\nb', 'x'.repeat(4097), Buffer.from([0xff])]) {
    const result = await capture({ input: Readable.from([password]), main() { assert.fail(); } });
    assert.equal(result.code, 1);
  }
});
test('validate-only mode builds URI in memory without invoking main or driver', async () => {
  const result = await capture({ mode: '--validate', main() { assert.fail(); } });
  assert.equal(result.code, 0); assert.match(result.out, /Sin conexión/);
  const config = wrapper.prepare(secret, env());
  assert.equal(new URL(config.ALAIA_INDEX_INSPECTION_URI).username, 'alaia_index_inspector');
  assert.equal(process.env.ALAIA_INDEX_INSPECTION_URI, undefined);
});
test('unexpected failures and interruption cannot expose original errors', async () => {
  const result = await capture({ main() { throw Error(sensitive); } }); assert.equal(result.code, 1);
  const controller = new AbortController(); controller.abort();
  const early = await capture({ signal: controller.signal, main() { assert.fail(); } }); assert.equal(early.code, 1);
});
test('CLI captures actual stdout/stderr, import and preparation cannot load driver or connect', () => {
  const script = path.resolve(__dirname, '../scripts/mongo-critical-index-inspection-private.js');
  const guard = `const Module=require('node:module'),load=Module._load;Module._load=function(name,...args){if(/^(mongodb|mongoose|dotenv|stripe|firebase-admin)(\\/|$)/.test(name))throw Error('${sensitive}');return load.call(this,name,...args);};require('node:net').Socket.prototype.connect=()=>{throw Error('${sensitive}');};`;
  const probe = spawnSync(process.execPath, ['-e', guard + `require(${JSON.stringify(script)});`], { env: {}, encoding: 'utf8', timeout: 5000 });
  assert.equal(probe.status, 0); assert.equal(probe.stdout + probe.stderr, '');
  for (const configuration of [env(), { ...env(), NODE_OPTIONS: '' }, { ...env(), ALAIA_INDEX_INSPECTION_CONFIRM: 'wrong' }]) {
    const child = spawnSync(process.execPath, [script, '--validate'], { env: configuration, input: secret, encoding: 'utf8', timeout: 5000 });
    assert.equal(child.error, undefined); assert.doesNotMatch(child.stdout + child.stderr, /SYNTHETIC_PRIVATE|mongodb(?:\+srv)?:\/\/|SENSITIVE_DRIVER_TRACE/);
    assert.equal(child.status, configuration.NODE_OPTIONS === '' || configuration.ALAIA_INDEX_INSPECTION_CONFIRM === 'wrong' ? 1 : 0);
  }
});
test('shell input is hidden, builtin pipe only; URI/password never exported or supplied to external argv', () => {
  const shell = fs.readFileSync(path.join(__dirname, '../scripts/mongo-critical-index-inspection-private.sh'), 'utf8');
  assert.match(shell, /read -r -s.*alaia_password <\/dev\/tty/);
  assert.match(shell, /builtin printf '%s' "\$alaia_password" \| env -i/);
  assert.doesNotMatch(shell, /export |ALAIA_INDEX_INSPECTION_URI=|ALAIA_PREP_PASSWORD=|tee /);
  assert.match(shell, /PIPESTATUS\[1\]/); assert.match(shell, /unset alaia_password/);
});
test('real subprocess stdout/stderr redact simulated authentication, connection, query and cleanup errors', () => {
  for (const stage of ['authentication', 'connection', 'query', 'cursor_cleanup', 'client_cleanup']) {
    const source = `const inspector=require(${JSON.stringify(path.resolve(__dirname,'../scripts/mongo-critical-index-inspector'))});const wrapper=require(${JSON.stringify(path.resolve(__dirname,'../scripts/mongo-critical-index-inspection-private'))});const sensitive=${JSON.stringify(sensitive)};const fakeMain=${fakeMain.toString()};wrapper.run({input:process.stdin,env:${JSON.stringify(env())},mode:'--inspect',stdout:process.stdout,stderr:process.stderr,main:fakeMain(${JSON.stringify(stage)})}).then(code=>process.exitCode=code);`;
    const child = spawnSync(process.execPath, ['-e', source], { env: {}, input: secret, encoding: 'utf8', timeout: 5000 });
    assert.equal(child.error, undefined); assert.equal(child.status, 1);
    assert.equal(JSON.parse(child.stdout).status, 'failed');
    assert.doesNotMatch(child.stdout + child.stderr, /SYNTHETIC_PRIVATE|mongodb(?:\+srv)?:\/\/|SENSITIVE_DRIVER_TRACE|\bat .*\.js:/);
  }
});
test('fixed classification uses structured fields and handles topology causes, ambiguity and cycles', () => {
  const classify = inspector.classifyFailure;
  assert.equal(classify(Error(sensitive), 'configuration'), 'configuration_invalid');
  assert.equal(classify(Object.assign(Error(sensitive), { code: 18 })), 'authentication_failed');
  assert.equal(classify({ name: 'MongoServerSelectionError', reason: { servers: new Map([['SENSITIVE_HOST', { error: { cause: { code: 'ENOTFOUND' } } }]]) } }), 'dns_failed');
  assert.equal(classify({ code: 13 }), 'authorization_denied');
  assert.equal(classify({ cause: { code: 'ERR_TLS_CERT_ALTNAME_INVALID' } }), 'tls_failed');
  assert.equal(classify({ name: 'MongoNetworkError' }), 'network_failed');
  assert.equal(classify({ name: 'MongoServerSelectionError' }), 'server_selection_failed');
  assert.equal(classify({ message: sensitive }), 'unknown');
  assert.equal(classify({ code: 18, cause: { code: 'ENOTFOUND' } }), 'ambiguous');
  const cycle = { code: 'ECONNRESET' }; cycle.cause = cycle;
  assert.equal(classify(cycle), 'network_failed');
  assert.equal(classify({ get code() { throw Error(sensitive); } }), 'unknown');
});
test('actual child output reports fixed authentication DNS TLS network and option categories without driver text', () => {
  const cases = [[{code:18},'authentication_failed'],[{code:'ENOTFOUND'},'dns_failed'],[{code:'CERT_HAS_EXPIRED'},'tls_failed'],[{code:'ECONNREFUSED'},'network_failed'],[{name:'MongoParseError'},'client_configuration_invalid'],[{code:13},'authorization_denied'],[{name:'MongoOperationTimeoutError'},'operation_timeout']];
  for (const [fields, category] of cases) {
    const source = `const inspector=require(${JSON.stringify(path.resolve(__dirname,'../scripts/mongo-critical-index-inspector'))});const wrapper=require(${JSON.stringify(path.resolve(__dirname,'../scripts/mongo-critical-index-inspection-private'))});class Client{on(){} async connect(){throw Object.assign(Error(${JSON.stringify(sensitive)}),${JSON.stringify(fields)});} async close(){}}wrapper.run({input:process.stdin,env:${JSON.stringify(env())},mode:'--inspect',stdout:process.stdout,stderr:process.stderr,main:(config,deps)=>inspector.main(config,{...deps,loadDriver:()=>({MongoClient:Client})})}).then(code=>process.exitCode=code);`;
    const child = spawnSync(process.execPath, ['-e', source], { env: {}, input: secret, encoding: 'utf8', timeout: 5000 });
    assert.equal(child.status, 1); assert.equal(JSON.parse(child.stdout).failureCode, category);
    assert.equal(JSON.parse(child.stdout).connectionEstablished, false);
    assert.doesNotMatch(child.stdout + child.stderr, /SYNTHETIC_PRIVATE|mongodb(?:\+srv)?:\/\/|SENSITIVE_DRIVER_TRACE|\bat .*\.js:/);
  }
});
test('installed 7.0.0 driver accepts unchanged client options without DNS or sockets', () => {
  const script = path.resolve(__dirname,'../scripts/mongo-critical-index-inspector');
  const source = `const assert=require('node:assert/strict');require('node:net').Socket.prototype.connect=()=>{throw Error('Network forbidden');};const dns=require('node:dns');for(const name of ['lookup','resolve','resolveSrv','resolveTxt']){dns[name]=()=>{throw Error('DNS forbidden');};if(dns.promises[name])dns.promises[name]=async()=>{throw Error('DNS forbidden');};}const inspector=require(${JSON.stringify(script)});let options;class Fake{constructor(uri,opts){options=opts;}on(){}async connect(){throw Error('Simulated');}async close(){}}inspector.main(${JSON.stringify(wrapper.prepare(secret,env()))},{loadDriver:()=>({MongoClient:Fake})}).then(()=>{assert.equal(require('mongodb/package.json').version,'7.0.0');const {MongoClient}=require('mongodb');const client=new MongoClient('mongodb+srv://synthetic:fixture@fixture.mongodb.net/backendmulti?authSource=admin',options);assert.equal(client.options.maxPoolSize,1);assert.equal(client.options.timeoutMS,3000);assert.equal(client.options.socketTimeoutMS,5000);assert.equal(client.options.waitQueueTimeoutMS,2000);assert.equal(client.options.mongodbLogComponentSeverities.default,'off');});`;
  const child = spawnSync(process.execPath, ['-e', source], { cwd:path.join(__dirname,'..'),env:{},encoding:'utf8',timeout:5000 });
  assert.equal(child.error, undefined); assert.equal(child.status, 0); assert.equal(child.stdout + child.stderr, '');
});
test('bounded aggregate diagnostics handle real driver classes, cycles, depth and conflicts without network', () => {
  const { MongoServerError, MongoRuntimeError, MongoNetworkError, MongoServerSelectionError } = require('mongodb');
  const auth = new MongoServerError({ message: sensitive, code: 18 });
  assert.equal(inspector.diagnoseFailure(auth).code, 'authentication_failed');
  const runtime = inspector.diagnoseFailure(new MongoRuntimeError(sensitive));
  assert.deepEqual(runtime.descriptors, ['driver_runtime_error']); assert.equal(runtime.code, 'unknown');
  const aggregate = new AggregateError([auth, new TypeError(sensitive)], sensitive);
  const report = inspector.diagnoseFailure(aggregate);
  assert.equal(report.code, 'authentication_failed'); assert.ok(report.descriptors.includes('aggregate_error')); assert.ok(report.descriptors.includes('native_type_error'));
  const network = new MongoNetworkError(sensitive, { cause: Object.assign(Error(sensitive), { code: 'ECONNRESET' }) });
  const selection = new MongoServerSelectionError(sensitive, { servers: new Map([['SENSITIVE_HOST', { error: network }]]) });
  assert.equal(inspector.diagnoseFailure(selection).code, 'network_failed');
  assert.equal(inspector.diagnoseFailure(new AggregateError([auth, network], sensitive)).code, 'ambiguous');
  const cycle = new AggregateError([], sensitive); cycle.errors.push(cycle, auth);
  assert.equal(inspector.diagnoseFailure(cycle).code, 'authentication_failed');
  const large = inspector.diagnoseFailure(new AggregateError(Array.from({length:40},()=>new TypeError(sensitive)),sensitive));
  assert.equal(large.traversalTruncated,true); assert.equal(large.code,'unknown');
  let deep=auth; for(let i=0;i<12;i++)deep={cause:deep};
  assert.equal(inspector.diagnoseFailure(deep).traversalTruncated,true);
  assert.doesNotMatch(JSON.stringify([runtime,report,large,inspector.diagnoseFailure(selection)]), /SENSITIVE_|mongodb(?:\+srv)?:\/\/|SYNTHETIC_PRIVATE/);
});
test('events and final exception remain separate: unknown cannot mask auth; contradictory events are ambiguous', async () => {
  for (const events of [[{}],[{},{}],[{code:'ENOTFOUND'}],[{code:18},{code:'ENOTFOUND'}]]) {
    let closed=0;
    class Client {on(_name,fn){this.event=fn;}async connect(){for(const fields of events)this.event(Object.assign(Error(sensitive),fields));throw Object.assign(Error(sensitive),{code:18});}async close(){closed++;}}
    const output=await capture({main:(config,deps)=>inspector.main(config,{...deps,loadDriver:()=>({MongoClient:Client})})});
    const report=JSON.parse(output.out);
    assert.equal(output.code,1); assert.equal(closed,1); assert.equal(report.substage,'client_connect');
    assert.equal(report.exceptionDiagnostic.code,'authentication_failed');
    assert.equal(report.failureCode,events.some(x=>x.code==='ENOTFOUND')?'ambiguous':'authentication_failed');
    assert.ok(report.eventDiagnostic); assert.equal(report.connectionEstablished,false);
  }
});
test('substage separates construction and identity failures; cleanup diagnostics do not replace original exception', async () => {
  for(const stage of ['client_construction','namespace_identity','client_connect']) {
    let closed=0;
    class Client {
      constructor(){if(stage==='client_construction')throw new TypeError(sensitive);}
      on(){}
      async connect(){if(stage==='client_connect')throw Object.assign(Error(sensitive),{code:18});}
      db(){return {databaseName:'wrong'};}
      async close(){closed++;if(stage==='client_connect')throw Object.assign(Error(sensitive),{code:'ECONNRESET'});}
    }
    const output=await capture({main:(config,deps)=>inspector.main(config,{...deps,loadDriver:()=>({MongoClient:Client})})});
    const report=JSON.parse(output.out);assert.equal(output.code,1);assert.equal(report.substage,stage);
    assert.equal(closed,stage==='client_construction'?0:1);
    assert.equal(report.connectionEstablished,stage==='namespace_identity');
    if(stage==='client_connect'){assert.equal(report.exceptionDiagnostic.code,'authentication_failed');assert.equal(report.cleanupDiagnostic.code,'network_failed');assert.equal(report.cleanupFailureCode,'network_failed');assert.equal(report.failureCode,'authentication_failed');}
  }
});
test('actual stdout/stderr with real locally constructed driver errors exposes only fixed descriptors', () => {
  const source=`const inspector=require(${JSON.stringify(path.resolve(__dirname,'../scripts/mongo-critical-index-inspector'))});const wrapper=require(${JSON.stringify(path.resolve(__dirname,'../scripts/mongo-critical-index-inspection-private'))});require('node:net').Socket.prototype.connect=()=>{throw Error('Network forbidden');};const {MongoServerError,MongoRuntimeError}=require('mongodb');const privateMessage=${JSON.stringify(sensitive)};class Client{on(n,fn){this.event=fn;}async connect(){this.event(new MongoRuntimeError(privateMessage));throw new AggregateError([new MongoServerError({message:privateMessage,code:18}),new TypeError(privateMessage)],privateMessage);}async close(){}}wrapper.run({input:process.stdin,env:${JSON.stringify(env())},mode:'--inspect',stdout:process.stdout,stderr:process.stderr,main:(c,d)=>inspector.main(c,{...d,loadDriver:()=>({MongoClient:Client})})}).then(code=>process.exitCode=code);`;
  const child=spawnSync(process.execPath,['-e',source],{cwd:path.join(__dirname,'..'),env:{},input:secret,encoding:'utf8',timeout:5000});
  assert.equal(child.status,1);assert.equal(child.error,undefined);
  const report=JSON.parse(child.stdout);assert.equal(report.failureCode,'authentication_failed');assert.deepEqual(report.eventDiagnostic.descriptors,['driver_runtime_error']);
  assert.doesNotMatch(child.stdout+child.stderr,/SENSITIVE_|mongodb(?:\+srv)?:\/\/|SYNTHETIC_PRIVATE|\bat .*\.js:/);
});
