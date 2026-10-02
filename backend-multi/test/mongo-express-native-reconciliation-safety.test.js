'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const runner = require('../scripts/mongo-express-native-reconciliation-integration');
const { acquireLedger, historical } = require('../scripts/reconciliation-integration/consumptionLedger');
const database = 'alaia_1123456789abcdef0123456789abcdef';
function fixture(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'alaia-ledger-local-'))); fs.chmodSync(directory, 0o700);
  const file = path.join(directory, 'consumed-databases.json');
  fs.writeFileSync(file, JSON.stringify({ version: 1, consumed: historical }), { mode: 0o600 });
  // Only local test artifacts are removed; runner has no deletion capability.
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, file };
}
const env = file => ({ ALAIA_MONGO_TEST_URI: `mongodb+srv://alaia_integration_test:fixture%40only@fixture.mongodb.net/${database}?authSource=admin&w=majority`, ALAIA_MONGO_TEST_DB: database, ALAIA_MONGO_TEST_CONFIRM: database, ALAIA_MONGO_TEST_LEDGER_PATH: file });
test('Express runner: unsafe configuration fails before loading dependencies or acquiring a ledger', async t => {
  const { file } = fixture(t), valid = env(file);
  const patches = [{}, { ALAIA_MONGO_TEST_URI: undefined }, { ALAIA_MONGO_TEST_CONFIRM: 'wrong' }, { ALAIA_MONGO_TEST_DB: 'backendmulti' }, { ALAIA_MONGO_TEST_LEDGER_PATH: undefined }, { ALAIA_MONGO_TEST_LEDGER_PATH: 'relative' }, { MONGO_URI: 'PRIVATE_SECRET' }, { NODE_ENV: 'production' }, { ALAIA_RECONCILIATION_NATIVE_READER_ENABLED: 'true' }, { STRIPE_SECRET_KEY: 'PRIVATE_SECRET' }, { NODE_OPTIONS: '--require=PRIVATE_MODULE' }, { DEBUG: 'PRIVATE_LOG' }];
  for (const name of historical) patches.push({ ALAIA_MONGO_TEST_DB: name, ALAIA_MONGO_TEST_CONFIRM: name, ALAIA_MONGO_TEST_URI: valid.ALAIA_MONGO_TEST_URI.replace(database, name) });
  patches.shift();
  for (const patch of patches) {
    let calls = 0;
    const result = await runner.main({ ...valid, ...patch }, { acquireLedger() { calls++; assert.fail(); }, loadDependencies() { calls++; assert.fail(); } });
    assert.equal(result.status, 'failed'); assert.equal(result.failedStage, 'configuration'); assert.equal(calls, 0);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|mongodb(?:\+srv)?:\/\//);
  }
});
test('Express runner: missing/corrupt/unsafe/locked/consumed ledger fails before constructing clients', async t => {
  for (const kind of ['missing', 'corrupt', 'permissions', 'locked', 'consumed', 'symlink', 'history_missing']) {
    const { file } = fixture(t);
    if (kind === 'missing') fs.unlinkSync(file);
    if (kind === 'corrupt') fs.writeFileSync(file, '{');
    if (kind === 'permissions') fs.chmodSync(file, 0o644);
    if (kind === 'locked') fs.mkdirSync(file + '.lock');
    if (kind === 'consumed') fs.writeFileSync(file, JSON.stringify({ version: 1, consumed: [...historical, database] }));
    if (kind === 'symlink') { fs.renameSync(file, file + '.original'); fs.symlinkSync(file + '.original', file); }
    if (kind === 'history_missing') fs.writeFileSync(file, JSON.stringify({ version: 1, consumed: [] }));
    let loads = 0;
    const result = await runner.main(env(file), { loadDependencies() { loads++; assert.fail(); } });
    assert.equal(result.failedStage, 'consumption ledger', kind); assert.equal(loads, 0);
  }
});
test('consumption ledger: exclusive lock, durable single-use and rejection even without database collections', t => {
  const { file } = fixture(t), first = acquireLedger(file);
  assert.throws(() => acquireLedger(file)); first.assertUnused(database); first.consume(database);
  assert.throws(() => first.consume(database)); first.close(); first.close();
  const second = acquireLedger(file); assert.throws(() => second.assertUnused(database)); second.close();
  assert.ok(JSON.parse(fs.readFileSync(file, 'utf8')).consumed.includes(database));
});
test('consumption ledger: corrupt append/crash and stale lock are fail-closed', t => {
  const { file } = fixture(t), first = acquireLedger(file);
  fs.writeFileSync(file, 'partial'); first.close(); assert.throws(() => acquireLedger(file));
  fs.writeFileSync(file, JSON.stringify({ version: 1, consumed: historical }));
  fs.mkdirSync(file + '.lock', { mode: 0o700 }); assert.throws(() => acquireLedger(file));
});
test('consumption ledger: inability to update or fsync never grants write admission', t => {
  const { file } = fixture(t), ledger = acquireLedger(file), original = fs.fsyncSync;
  try { fs.fsyncSync = () => { throw Error('PRIVATE_SECRET'); }; assert.throws(() => ledger.consume(database)); }
  finally { fs.fsyncSync = original; ledger.close(); }
});
test('Express runner import is inert with infrastructure forbidden', () => {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, ['-e', `
    const Module=require('node:module'), load=Module._load;
    Module._load=function(name,...args){if(/^(mongodb|mongoose|express|stripe|firebase|firebase-admin|dotenv)(\\/|$)/.test(name))throw Error('Forbidden import');return load.call(this,name,...args);};
    require('node:net').Socket.prototype.connect=()=>{throw Error('Forbidden connection');};
    const runner=require(${JSON.stringify(path.resolve(__dirname, '../scripts/mongo-express-native-reconciliation-integration'))});
    runner.main({}).then(result=>{if(result.failedStage!=='configuration')process.exitCode=1;});
  `], { env: {}, timeout: 5000, encoding: 'utf8' });
  assert.equal(result.status, 0); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
});
test('database fence: denies foreign namespaces, explicit indexes, destructive APIs and financial updates', () => {
  const { fenceClient } = require('../scripts/reconciliation-integration/databaseFence');
  const fake = { db: name => ({ databaseName: name, collection: () => ({ updateOne() {}, updateMany() {}, findOneAndUpdate() {}, aggregate() {} }), createCollection() {}, admin: () => ({ command() {} }) }) }, evidence = {};
  fenceClient(fake, { database, names: runner.names }, evidence);
  assert.throws(() => fake.db('backendmulti'));
  const db = fake.db(database), collection = db.collection('express_orders');
  for (const method of ['deleteMany', 'drop', 'createIndex', 'createIndexes', 'bulkWrite', 'updateOne']) assert.throws(() => collection[method]({}));
  assert.throws(() => db.dropDatabase()); assert.throws(() => db.command({ createIndexes: 'express_orders' }));
  assert.throws(() => collection.aggregate([{ $merge: 'express_orders' }]));
  assert.throws(() => collection.aggregate([{ $lookup: { from: 'foreign', pipeline: [] } }]));
  assert.equal(evidence.forbiddenAttempt, true);
});
test('Express runner sources never execute production entry point, forbidden SDKs, index synchronization or data deletion', () => {
  const files = [path.resolve(__dirname, '../scripts/mongo-express-native-reconciliation-integration.js'), ...fs.readdirSync(path.resolve(__dirname, '../scripts/reconciliation-integration')).filter(name => name.endsWith('.js')).map(name => path.resolve(__dirname, '../scripts/reconciliation-integration', name))];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /require\(['"](?:stripe|firebase-admin|dotenv|.*\/server(?:\.js)?|.*workers|.*scheduler)['"]\)/);
    assert.doesNotMatch(source, /\.(?:createIndex|createIndexes|syncIndexes|ensureIndexes|dropDatabase|dropCollection|deleteOne|deleteMany|drop)\s*\(/);
  }
});
function infrastructure({ roles, existing = [], writeFault, cleanupFault, primary = true, privileges, transactionFault, beforeWrite = () => {}, beforeClose = () => {} } = {}) {
  const calls = [], data = new Map();
  class MongoClient {
    constructor() { calls.push('construct'); }
    async connect() { calls.push('connect'); }
    async close() { beforeClose(); calls.push('close'); if (cleanupFault) throw Error('PRIVATE_CLEANUP'); }
    startSession() {
      let active = false;
      return { startTransaction() { if (transactionFault) throw Error('PRIVATE_UNAVAILABLE_TRANSACTION'); active = true; calls.push('snapshot'); }, inTransaction: () => active,
        async abortTransaction() { active = false; calls.push('abort'); }, async endSession() { calls.push('endSession'); } };
    }
    db(name) {
      calls.push('db'); return { databaseName: name,
        listCollections: () => ({ toArray: async () => existing, close: async () => calls.push('cursorClose') }),
        collection: name => ({ find: filter => ({ toArray: async () => data.get(name)?.filter(item => item._id === filter._id) || [], close: async () => calls.push('cursorClose') }),
          aggregate() {}, updateOne() {}, updateMany() {}, findOneAndUpdate() {},
          async insertOne(record) { beforeWrite(); calls.push('insert:' + name); if (writeFault === 'insert') throw Error('PRIVATE_UNCERTAIN'); data.set(name, [record]); return { acknowledged: writeFault !== 'unacknowledged' }; } }),
        async createCollection(name) { beforeWrite(); calls.push('create:' + name); if (writeFault === 'create' || name !== runner.marker) throw Error('PRIVATE_PROVISION'); },
        admin: () => ({ command: async cmd => cmd.hello ? { isWritablePrimary: primary, setName: 'fixture', logicalSessionTimeoutMinutes: 30, maxWireVersion: 13 } : { authInfo: {
          authenticatedUsers: [{ user: 'alaia_integration_test', db: 'admin' }], authenticatedUserRoles: roles || [{ role: 'readWrite', db: database }], authenticatedUserPrivileges: privileges || [{ resource: { db: database, collection: '' }, actions: ['find', 'insert', 'update', 'listCollections', 'createCollection'] }] } } }),
      };
    }
  }
  const loadDependencies = () => ({ driver: { MongoClient }, Mongoose: null, version: '7.0.0' });
  const createRuntime = () => {
    const client = new MongoClient();
    return { mongoose: { async connect() { calls.push('mongooseConnect'); }, async disconnect() { calls.push('mongooseDisconnect'); }, connection: { name: database, getClient: () => client } }, models: {} };
  };
  return { calls, loadDependencies, createRuntime };
}
test('Express runner: broad roles, existing empty collections and unsupported transactions stop before consumption/writes', async t => {
  for (const options of [{ roles: [{ role: 'readWriteAnyDatabase', db: 'admin' }] }, { existing: [{ name: 'empty' }] }, { existing: '' }, { primary: false }, { transactionFault: true }, { privileges: [{ resource: { db: database, collection: '' } }] }]) {
    const { file } = fixture(t), fake = infrastructure(options);
    const result = await runner.main(env(file), fake);
    assert.equal(result.status, 'failed'); assert.equal(result.claimAttempted, false);
    assert.ok(!fake.calls.some(call => call.startsWith('create:') || call.startsWith('insert:')));
    assert.ok(!JSON.parse(fs.readFileSync(file, 'utf8')).consumed.includes(database));
    assert.equal(fake.calls.at(-1), 'close');
  }
});
test('Express runner: durable consume precedes every marker attempt, uncertain writes retain consumption and stop seeding', async t => {
  for (const writeFault of ['create', 'insert', 'unacknowledged', undefined]) {
    const { file } = fixture(t), fake = infrastructure({ writeFault, beforeWrite: () => assert.ok(JSON.parse(fs.readFileSync(file, 'utf8')).consumed.includes(database), 'Consume must precede any write') });
    const result = await runner.main(env(file), fake);
    assert.equal(result.status, 'failed'); assert.equal(result.claimAttempted, true); assert.equal(result.syntheticDataRetained, writeFault === undefined ? null : false);
    assert.ok(JSON.parse(fs.readFileSync(file, 'utf8')).consumed.includes(database));
    assert.equal(fake.calls.filter(call => call === 'create:' + runner.marker).length, 1);
    assert.equal(result.markerAcknowledged, writeFault === undefined);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|mongodb(?:\+srv)?:\/\//);
    let loads = 0; const repeat = await runner.main(env(file), { loadDependencies() { loads++; assert.fail(); } });
    assert.equal(repeat.failedStage, 'consumption ledger'); assert.equal(loads, 0);
  }
});
test('Express runner: failed ledger update never attempts marker and failed cleanup yields failed status', async t => {
  const { file } = fixture(t), fake = infrastructure();
  const result = await runner.main(env(file), { ...fake, acquireLedger: () => ({ assertUnused() {}, consume() { throw Error('PRIVATE_UPDATE'); }, close() {} }) });
  assert.equal(result.failedStage, 'durable consumption'); assert.equal(result.claimAttempted, false);
  assert.ok(!fake.calls.some(call => call.startsWith('create:')));
  const cleanup = await runner.main(env(file), infrastructure({ roles: [], cleanupFault: true }));
  assert.equal(cleanup.status, 'failed'); assert.equal(cleanup.failedStage, 'cleanup'); assert.equal(cleanup.cleanup, 'failed');
});
test('ledger across two OS processes: occupied lock rejects contender, persisted consumption rejects later attempt', async t => {
  const { spawn } = require('node:child_process'), { file } = fixture(t);
  const source = `
    const {acquireLedger}=require(process.argv[1]);let ledger;
    process.on('message', command=>{try{
      if(command==='hold'){ledger=acquireLedger(process.argv[2]);process.send('held');}
      if(command==='contend'){try{const other=acquireLedger(process.argv[2]);other.close();process.send('unexpected');}catch{process.send('blocked');}}
      if(command==='consume'){ledger.consume(process.argv[3]);ledger.close();process.send('consumed');process.disconnect();}
      if(command==='retry'){const other=acquireLedger(process.argv[2]);try{other.assertUnused(process.argv[3]);process.send('unexpected');}catch{process.send('historically_blocked');}finally{other.close();process.disconnect();}}
    }catch{process.send('failed');process.disconnect();}});process.send('ready');`;
  const create = () => {
    const child = spawn(process.execPath, ['-e', source, path.resolve(__dirname, '../scripts/reconciliation-integration/consumptionLedger'), file, database], { env: {}, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const messages = [], output = []; child.on('message', message => messages.push(message));
    child.stdout.on('data', data => output.push(data.toString())); child.stderr.on('data', data => output.push(data.toString()));
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await exited; });
    const wait = message => new Promise((resolve, reject) => {
      const deadline = setTimeout(() => { clearInterval(poll); reject(Error('Local child ledger deadline')); }, 5000);
      const poll = setInterval(() => { if (messages.includes(message)) { clearInterval(poll); clearTimeout(deadline); resolve(); } }, 2);
    });
    return { child, messages, output, wait, exited };
  };
  const first = create(), second = create(); await Promise.all([first.wait('ready'), second.wait('ready')]);
  first.child.send('hold'); await first.wait('held'); second.child.send('contend'); await second.wait('blocked');
  first.child.send('consume'); await first.wait('consumed'); assert.equal((await first.exited).code, 0);
  second.child.send('retry'); await second.wait('historically_blocked'); assert.equal((await second.exited).code, 0);
  assert.ok(!first.messages.includes('unexpected') && !second.messages.includes('unexpected'));
  assert.deepEqual(first.output.concat(second.output), []);
});
test('ledger pinned descriptor: symlink and regular-file substitution after locking cannot write replacement', t => {
  for (const kind of ['symlink', 'regular']) {
    const { file } = fixture(t), ledger = acquireLedger(file), alternate = file + '.alternate';
    const original = fs.readFileSync(file, 'utf8'); fs.writeFileSync(alternate, original, { mode: 0o600 });
    fs.renameSync(file, file + '.pinned');
    if (kind === 'symlink') fs.symlinkSync(alternate, file); else fs.renameSync(alternate, file);
    assert.throws(() => ledger.consume(database));
    assert.equal(fs.readFileSync(kind === 'symlink' ? alternate : file, 'utf8'), original);
    ledger.close();
  }
});
test('ledger interrupted partial write and changed content are detected; no silent admission', t => {
  const { file } = fixture(t), ledger = acquireLedger(file), write = fs.writeSync;
  let calls = 0;
  try {
    fs.writeSync = (fd, buffer, offset, length, position) => { if (calls++) throw Error('Interrupted local write'); return write(fd, buffer, offset, Math.min(9, length), position); };
    assert.throws(() => ledger.consume(database));
  } finally { fs.writeSync = write; ledger.close(); }
  const reopened = acquireLedger(file);
  fs.writeFileSync(file, JSON.stringify({ version: 1, consumed: [...historical, 'alaia_' + 'a'.repeat(32)] }));
  assert.throws(() => reopened.consume(database)); reopened.close();
});
test('historical deny list matches every prior runner namespace literal', () => {
  for (const name of ['mongo-phase5b-integration.js', 'mongo-reconciliation-review-integration.js', 'mongo-native-reconciliation-reader-integration.js']) {
    const source = fs.readFileSync(path.resolve(__dirname, '../scripts', name), 'utf8');
    for (const base of source.match(/alaia_(?:integration_)?[a-f0-9]{32}/g) || []) assert.ok(historical.includes(base));
  }
});
test('interruption before clients and after durable consumption stops all new writes', async t => {
  const { file } = fixture(t), controller = new AbortController(); controller.abort(); let loads = 0;
  const early = await runner.main(env(file), { signal: controller.signal, loadDependencies() { loads++; assert.fail(); } });
  assert.equal(early.interrupted, true); assert.equal(loads, 0);
  const laterController = new AbortController(), fake = infrastructure();
  const later = await runner.main(env(file), { ...fake, signal: laterController.signal, acquireLedger: name => {
    const ledger = acquireLedger(name); return { assertUnused: name => ledger.assertUnused(name), close: () => ledger.close(), consume(name) { ledger.consume(name); laterController.abort(); } };
  } });
  assert.equal(later.interrupted, true); assert.equal(later.claimAttempted, false);
  assert.ok(JSON.parse(fs.readFileSync(file, 'utf8')).consumed.includes(database));
  assert.ok(!fake.calls.some(call => call.startsWith('create:') || call.startsWith('insert:')));
});
test('real SIGTERM in local child exercises CLI handler with a blocked FAKE connect and no writes', async t => {
  const { spawn } = require('node:child_process'), { file } = fixture(t);
  const modulePath = path.resolve(__dirname, '../scripts/mongo-express-native-reconciliation-integration.js');
  const source = `
    const fs=require('node:fs'),vm=require('node:vm'), runner=require(process.argv[1]);
    const source=fs.readFileSync(process.argv[1],'utf8'),entry=source.slice(source.indexOf('if (require.main === module) {'),source.indexOf('\\nmodule.exports ='));
    const module={},requireDouble={main:module};let activeSignal;
    class Client {db(){throw Error('No database calls permitted');} async connect(){process.send('blocked');await new Promise(resolve=>activeSignal.addEventListener('abort',resolve,{once:true}));} async close(){}}
    const database=process.argv[3],configuration={ALAIA_MONGO_TEST_URI:'mongodb+srv://alaia_integration_test:fixture@fixture.mongodb.net/'+database,ALAIA_MONGO_TEST_DB:database,ALAIA_MONGO_TEST_CONFIRM:database,ALAIA_MONGO_TEST_LEDGER_PATH:process.argv[2]};
    vm.runInNewContext(entry,{module,require:requireDouble,AbortController,process,console,setTimeout,clearTimeout,safeSummary:runner.safeSummary,
      main(_env,options){activeSignal=options.signal;return runner.main(configuration,{...options,loadDependencies:()=>({version:'7.0.0',driver:{MongoClient:Client},Mongoose:null})});}});
  `;
  const child = spawn(process.execPath, ['-e', source, modulePath, file, database], { env: {}, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let stdout = '', stderr = ''; child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  const exit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const deadline = setTimeout(() => child.kill('SIGKILL'), 5000);
  t.after(async () => { clearTimeout(deadline); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await exit; });
  child.once('message', () => child.kill('SIGTERM'));
  const result = await exit; clearTimeout(deadline); assert.equal(result.code, 1); assert.equal(result.signal, null);
  const output = JSON.parse(stdout); assert.equal(output.interrupted, true); assert.equal(output.claimAttempted, false); assert.equal(output.cleanup, 'local_work_settled');
  assert.equal(stderr, ''); assert.doesNotMatch(stdout, /mongodb(?:\+srv)?:\/\/|PRIVATE_/);
});

test('signal during final cleanup cannot report successful non-interrupted completion', async t => {
  const { file } = fixture(t), controller = new AbortController();
  const result = await runner.main(env(file), { ...infrastructure({ roles: [], beforeClose: () => controller.abort() }), signal: controller.signal });
  assert.equal(result.status, 'failed');
  assert.equal(result.interrupted, true);
  assert.equal(result.cleanup, 'local_work_settled');
  assert.equal(result.claimAttempted, false);
});
