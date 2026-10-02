'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const inspector = require('../scripts/mongo-critical-index-inspector');
const target = { project: '0123456789abcdef01234567', cluster: 'FixtureCluster', host: 'fixture.mongodb.net', database: 'application_fixture' };
const env = () => ({
  ALAIA_INDEX_INSPECTION_URI: 'mongodb+srv://metadata_fixture:synthetic%40password@fixture.mongodb.net/application_fixture?authSource=admin&tls=true',
  ALAIA_INDEX_INSPECTION_PROJECT_ID: target.project, ALAIA_INDEX_INSPECTION_CLUSTER_NAME: target.cluster,
  ALAIA_INDEX_INSPECTION_HOST: target.host, ALAIA_INDEX_INSPECTION_DB: target.database,
  ALAIA_INDEX_INSPECTION_CONFIRM: inspector.confirmation(target),
});
const indexes = name => [{ key: { _id: 1 }, name: '_id_' }, ...inspector.expected.filter(spec => spec.collection === name).map(spec => ({ key: { ...spec.key }, unique: spec.unique, sparse: spec.sparse, name: 'PRIVATE_INDEX_NAME' }))];
function double({ queryFailure, cursorFailure, closeFailure, missing, foreign, mismatch, wrongDb, view, comparisonFailure } = {}) {
  const calls = [], options = [];
  function cursor(items, label) {
    calls.push('cursor:' + label); let i = 0;
    return { async next() { calls.push('next:' + label); if (queryFailure) throw Error('mongodb+srv://PRIVATE_SECRET PRIVATE_TOKEN'); return items[i++] ?? null; }, async close(opts) { calls.push('cursorClose:' + label); assert.equal(opts.timeoutMS, 2000); if (cursorFailure) throw Error('PRIVATE_CLEANUP'); } };
  }
  class MongoClient {
    constructor(uri, opts) { calls.push('construct'); options.push(opts); }
    on() {}
    async connect() { calls.push('connect'); }
    async close() { calls.push('close'); if (closeFailure) throw Error('PRIVATE_CLOSE'); }
    db(name) {
      assert.equal(name, target.database); calls.push('db');
      return { databaseName: wrongDb ? 'other' : name,
        listCollections(filter, opts) {
          assert.deepEqual(filter, { name: { $in: [...inspector.collections] } });
          assert.deepEqual(opts, { timeoutMS: 3000, maxTimeMS: 3000, nameOnly: false });
          const records = inspector.collections.filter(n => n !== missing).map(name => ({ name, type: view ? 'view' : 'collection', options: { validator: { secret: 'PRIVATE_DOCUMENT' } } }));
          if (foreign) records[0].name = 'other_collection';
          return cursor(records, 'collections');
        },
        collection(name) {
          assert.ok(inspector.collections.includes(name)); calls.push('collection:' + name);
          return { listIndexes(opts) {
            assert.deepEqual(opts, { timeoutMS: 3000, maxTimeMS: 3000 });
            let values = indexes(name);
            if (mismatch && name === 'usuarios') values = values.filter(v => !v.key.email);
            if (comparisonFailure) values[1].partialFilterExpression = { email: 'PRIVATE_USER_DOCUMENT' };
            return cursor(values, name);
          } };
        },
      };
    }
  }
  return { calls, options, loadDriver: () => ({ MongoClient }) };
}
test('wrong/ambiguous destinations and consumed integration names fail before constructing a client', async () => {
  const bad = [
    { ALAIA_INDEX_INSPECTION_CONFIRM: undefined }, { ALAIA_INDEX_INSPECTION_PROJECT_ID: '' },
    { ALAIA_INDEX_INSPECTION_CLUSTER_NAME: '<cluster>' }, { ALAIA_INDEX_INSPECTION_HOST: 'other.mongodb.net' },
    { ALAIA_INDEX_INSPECTION_DB: 'other_database' }, { ALAIA_INDEX_INSPECTION_CONFIRM: 'wrong' },
    { MONGO_URI: 'PRIVATE_SECRET' }, { NODE_OPTIONS: '' }, { ALAIA_MONGO_TEST_DB: 'fixture' },
    { ALAIA_INDEX_INSPECTION_EXTRA: 'extra' }, { MONGODB_LOG_ALL: '' },
  ];
  const { historical } = require('../scripts/reconciliation-integration/consumptionLedger');
  for (const database of [...historical, 'alaia_ab96febfbef06dfc2c2daabefae08bb9', 'alaia_' + 'a'.repeat(32), 'admin', 'config', 'local', 'test']) {
    const next = { ...target, database };
    bad.push({ ALAIA_INDEX_INSPECTION_DB: database, ALAIA_INDEX_INSPECTION_URI: env().ALAIA_INDEX_INSPECTION_URI.replace('/application_fixture', '/' + database), ALAIA_INDEX_INSPECTION_CONFIRM: inspector.confirmation(next) });
  }
  const uri = env().ALAIA_INDEX_INSPECTION_URI;
  for (const value of [uri.replace('metadata_fixture', 'alaia_integration_test'), uri.replace('/application_fixture', '/'), uri + '&tls=false', uri + '&authSource=admin', uri + '&retryWrites=true', uri + '#fragment', uri.replace('synthetic%40password', '%ZZ')]) bad.push({ ALAIA_INDEX_INSPECTION_URI: value });
  for (const patch of bad) {
    let loads = 0;
    const report = await inspector.main({ ...env(), ...patch }, { loadDriver() { loads++; assert.fail(); } });
    assert.equal(loads, 0); assert.equal(report.status, 'failed'); assert.equal(report.stage, 'configuration');
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE_|mongodb(?:\+srv)?:\/\//);
  }
});
test('import is inert even when drivers, services and network are forbidden', () => {
  const child = spawnSync(process.execPath, ['-e', `
    const Module=require('node:module'),load=Module._load;
    Module._load=function(name,...args){if(/^(mongodb|mongoose|express|stripe|firebase-admin|dotenv)(\\/|$)/.test(name))throw Error('Forbidden dependency');return load.call(this,name,...args);};
    require('node:net').Socket.prototype.connect=()=>{throw Error('Forbidden network');};
    require(${JSON.stringify(path.resolve(__dirname, '../scripts/mongo-critical-index-inspector.js'))});
  `], { env: {}, encoding: 'utf8', timeout: 5000 });
  assert.equal(child.error, undefined); assert.equal(child.status, 0); assert.equal(child.stdout, ''); assert.equal(child.stderr, '');
});
test('capability scope permits only authorized collection/index metadata', () => {
  const fake = double(), client = new (fake.loadDriver().MongoClient)();
  const scope = inspector.metadataScope(client, inspector.validateConfig(env()));
  assert.deepEqual(Object.keys(scope), ['collections', 'indexes']);
  assert.throws(() => scope.indexes('other', {}));
  assert.throws(() => scope.indexes('backendmulti', {}));
  for (const method of ['db', 'collection', 'find', 'aggregate', 'insertOne', 'createIndex', 'syncIndexes', 'drop']) assert.equal(scope[method], undefined);
  assert.equal(fake.calls.filter(call => call.startsWith('collection:')).length, 0);
});
test('inspection uses only metadata, bounded options and sequential cursor/client cleanup', async () => {
  const fake = double(); const report = await inspector.main(env(), fake);
  assert.equal(report.status, 'completed'); assert.equal(report.cleanup, 'local_work_settled');
  assert.equal(report.report.length, 3); assert.ok(report.report.every(row => row.rows.every(index => index.status === 'matching')));
  assert.equal(fake.calls.at(-1), 'close'); assert.equal(fake.calls.filter(call => call.startsWith('cursorClose:')).length, 4);
  assert.deepEqual(fake.options[0], { dbName: target.database, maxPoolSize: 1, minPoolSize: 0, maxConnecting: 1, serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, waitQueueTimeoutMS: 2000, socketTimeoutMS: 5000, timeoutMS: 3000, retryReads: false, retryWrites: false, readPreference: 'primary', tls: true, mongodbLogComponentSeverities: { default: 'off' } });
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_|metadata_fixture|synthetic|mongodb(?:\+srv)?:\/\//);
});
test('missing, foreign, views, identity mismatch, index mismatch and ambiguous outcomes fail closed', async () => {
  for (const options of [{ missing: 'usuarios' }, { foreign: true }, { view: true }, { wrongDb: true }, { mismatch: true }, { comparisonFailure: true }]) {
    const fake = double(options), report = await inspector.main(env(), fake);
    assert.equal(report.status, 'failed'); assert.equal(fake.calls.at(-1), 'close');
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE_|mongodb(?:\+srv)?:\/\//);
  }
});
test('query, cursor and client cleanup failures are generic and non-successful', async () => {
  for (const options of [{ queryFailure: true }, { cursorFailure: true }, { closeFailure: true }]) {
    const fake = double(options), report = await inspector.main(env(), fake);
    assert.equal(report.status, 'failed'); assert.equal(fake.calls.at(-1), 'close');
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE_|mongodb(?:\+srv)?:\/\//);
    if (options.closeFailure || options.cursorFailure) assert.equal(report.cleanup, 'failed');
  }
});
test('comparison distinguishes uniqueness, sparse, partial filters, collation, TTL and ambiguous keys without leaking values', () => {
  for (const change of [{ unique: false }, { sparse: true }, { partialFilterExpression: { email: 'PRIVATE_EMAIL' } }, { collation: { locale: 'en', strength: 2 } }, { expireAfterSeconds: 999 }, { buildUUID: 'PRIVATE_BUILD_ID' }, { ready: false }]) {
    const values = indexes('usuarios'); Object.assign(values[1], change);
    const report = inspector.compareIndexes('usuarios', values);
    assert.equal(report.rows[0].status, 'incompatible'); assert.doesNotMatch(JSON.stringify(report), /PRIVATE_|999|strength/);
  }
  const duplicate = indexes('usuarios'); duplicate.push({ ...duplicate[1] });
  assert.equal(inspector.compareIndexes('usuarios', duplicate).rows[0].status, 'ambiguous');
  const hidden = indexes('usuarios'); hidden[1].hidden = true;
  assert.equal(inspector.compareIndexes('usuarios', hidden).rows[0].status, 'matching');
  assert.equal(inspector.compareIndexes('usuarios', hidden).rows[0].hidden, true);
  const defaults = { collation: { locale: 'en', strength: 2 } }, values = indexes('usuarios');
  values.forEach(index => { index.collation = { strength: 2, locale: 'en' }; });
  assert.ok(inspector.compareIndexes('usuarios', values, defaults).rows.every(row => row.status === 'matching'));
});
test('pre-aborted inspection never loads a driver; interruption during query waits for cursor cleanup', async () => {
  const controller = new AbortController(); controller.abort(); let loaded = false;
  const early = await inspector.main(env(), { signal: controller.signal, loadDriver() { loaded = true; assert.fail(); } });
  assert.equal(loaded, false); assert.equal(early.interrupted, true);
  let release, entered; const gate = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { entered = resolve; });
  const calls = [], interruption = new AbortController();
  class MongoClient {
    async connect() {} async close() { calls.push('close'); }
    db() { return { databaseName: target.database, listCollections: () => ({ async next() { entered(); await gate; return null; }, async close() { calls.push('cursorClose'); } }) }; }
  }
  const pending = inspector.main(env(), { signal: interruption.signal, loadDriver: () => ({ MongoClient }) });
  await started; interruption.abort(); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(calls, []);
  release(); const report = await pending; assert.equal(report.status, 'failed'); assert.equal(report.interrupted, true);
  assert.deepEqual(calls, ['cursorClose', 'close']);
});
test('approved manifest matches actual disconnected local model index declarations', () => {
  const child = spawnSync(process.execPath, ['-e', `
    require('node:net').Socket.prototype.connect=()=>{throw Error('Forbidden network');};
    const mongoose=require('mongoose');mongoose.set('autoIndex',false);mongoose.set('autoCreate',false);
    mongoose.connect=mongoose.createConnection=()=>{throw Error('Forbidden connection');};
    const specs=${JSON.stringify(inspector.expected)};
    const models={usuarios:require('./src/models/Usuario'),counters:require('./src/models/Counter'),webhookevents:require('./src/models/WebhookEvent')};
    for(const spec of specs){const matching=models[spec.collection].schema.indexes().filter(([key])=>JSON.stringify(Object.entries(key))===JSON.stringify(Object.entries(spec.key)));if(matching.length!==1||Boolean(matching[0][1].unique)!==spec.unique||Boolean(matching[0][1].sparse)!==spec.sparse)throw Error('Manifest mismatch');if(models[spec.collection].collection.name!==spec.collection)throw Error('Collection mismatch');}
    if(mongoose.connection.readyState!==0)throw Error('Unexpected connection');
  `], { cwd: path.join(__dirname, '..'), env: {}, timeout: 5000, encoding: 'utf8' });
  assert.equal(child.error, undefined); assert.equal(child.status, 0, child.stderr);
});
test('inspector source has no startup, document, write or index-management APIs', () => {
  const source = fs.readFileSync(path.join(__dirname, '../scripts/mongo-critical-index-inspector.js'), 'utf8');
  assert.doesNotMatch(source, /require\(['"](?:mongoose|dotenv|express|stripe|firebase-admin|.*\/server|.*\/models\/|.*\/workers)/);
  assert.doesNotMatch(source, /\.(?:find|findOne|aggregate|insertOne|updateOne|deleteOne|deleteMany|createCollection|createIndex|createIndexes|syncIndexes|drop|dropIndex|dropIndexes)\s*\(/);
});

test('blocked client cleanup retains pending work until actual settlement', async () => {
  let entered, release; const started = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const fake = double(), Base = fake.loadDriver().MongoClient;
  class Client extends Base { async close() { entered(); await gate; await super.close(); } }
  let settled = false; const pending = inspector.main(env(), { loadDriver: () => ({ MongoClient: Client }) }).then(report => { settled = true; return report; });
  await started; await new Promise(resolve => setImmediate(resolve)); assert.equal(settled, false);
  release(); const report = await pending; assert.equal(report.cleanup, 'local_work_settled');
});
test('watchdog is explicitly failed with unknown cleanup, never remote cancellation', () => {
  const vm = require('node:vm'), source = fs.readFileSync(path.join(__dirname, '../scripts/mongo-critical-index-inspector.js'), 'utf8');
  const entry = source.slice(source.indexOf('if (require.main === module)'), source.indexOf('module.exports ='));
  let watchdog; const output = [], exits = [], module = {};
  const requireDouble = Object.assign(() => { throw Error('Forbidden import'); }, { main: module });
  vm.runInNewContext(entry, { module, require: requireDouble, AbortController,
    main: (_env, dependencies) => { dependencies.onState({ report: [], cleanup: 'not_started' }); return new Promise(() => {}); },
    result: state => ({ status: state.failed ? 'failed' : 'completed', stage: state.stage, cleanup: state.cleanup, remoteTermination: 'not_verified' }),
    process: { env: {}, on() {}, removeListener() {}, exit(code) { exits.push(code); } },
    console: { error(text) { output.push(JSON.parse(text)); }, log() { assert.fail(); } },
    setTimeout(fn, ms) { assert.equal(ms, 45000); watchdog = fn; return 1; }, clearTimeout() {},
  });
  watchdog(); assert.deepEqual(exits, [1]);
  assert.deepEqual(output, [{ status: 'failed', stage: 'watchdog', cleanup: 'pending_or_unknown', remoteTermination: 'not_verified' }]);
});
