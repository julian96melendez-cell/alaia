'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig, main, formatFailure } = require('../scripts/mongo-phase5b-integration');
const fs = require('node:fs');
const vm = require('node:vm');
const db = 'alaia_' + 'a'.repeat(32);
const valid = { ALAIA_MONGO_TEST_DB: db, ALAIA_MONGO_TEST_CONFIRM: db, ALAIA_MONGO_TEST_URI: 'mongodb+srv://example.mongodb.net/?retryWrites=true&w=majority' };
test('dedicated test configuration accepted without connecting', () => assert.equal(validateConfig(valid).db, db));
test('approved 38-byte database and explicit URI path accepted without connecting', () => {
 const approved = 'alaia_78943cf524ef883d31e9628163931fe8';
 assert.equal(Buffer.byteLength(approved, 'utf8'), 38);
 assert.equal(validateConfig({ ...valid, ALAIA_MONGO_TEST_DB: approved, ALAIA_MONGO_TEST_CONFIRM: approved, ALAIA_MONGO_TEST_URI: `mongodb+srv://example.mongodb.net/${approved}?authSource=admin&retryWrites=true&w=majority` }).db, approved);
});
test('legacy 50-byte database and URI path rejected', () => {
 const legacy = 'alaia_integration_' + 'a'.repeat(32);
 assert.throws(() => validateConfig({ ...valid, ALAIA_MONGO_TEST_DB: legacy, ALAIA_MONGO_TEST_CONFIRM: legacy }));
 assert.throws(() => validateConfig({ ...valid, ALAIA_MONGO_TEST_URI: `mongodb+srv://example.mongodb.net/${legacy}` }));
});
test('random suffix requires exactly 32 lowercase hexadecimal characters', () => {
 for (const invalid of ['alaia_' + 'a'.repeat(31), 'alaia_' + 'a'.repeat(33), 'alaia_' + 'A'.repeat(32), 'alaia_' + 'g'.repeat(32), 'alaia_' + 'é'.repeat(32), 'alaia_' + 'a'.repeat(32) + '\n']) {
  assert.throws(() => validateConfig({ ...valid, ALAIA_MONGO_TEST_DB: invalid, ALAIA_MONGO_TEST_CONFIRM: invalid }));
 }
});
test('confirmation and URI must match the selected short database', () => {
 const other = 'alaia_' + 'b'.repeat(32);
 assert.throws(() => validateConfig({ ...valid, ALAIA_MONGO_TEST_CONFIRM: other }));
 assert.throws(() => validateConfig({ ...valid, ALAIA_MONGO_TEST_URI: `mongodb+srv://example.mongodb.net/${other}` }));
});
test('production database rejected', () => assert.throws(() => validateConfig({ ...valid, ALAIA_MONGO_TEST_DB: 'backendmulti' })));
test('production URI path rejected despite test db override', () => assert.throws(() => validateConfig({ ...valid, ALAIA_MONGO_TEST_URI: 'mongodb+srv://example.mongodb.net/backendmulti' })));
test('MONGO_URI is never a fallback', () => assert.throws(() => validateConfig({ ...valid, ALAIA_MONGO_TEST_URI: '', MONGO_URI: valid.ALAIA_MONGO_TEST_URI })));
test('explicit confirmation required', () => assert.throws(() => validateConfig({ ...valid, ALAIA_MONGO_TEST_CONFIRM: '' })));
test('local host and TLS bypass rejected', () => {
 assert.throws(() => validateConfig({ ...valid, ALAIA_MONGO_TEST_URI: 'mongodb://localhost/' }));
 assert.throws(() => validateConfig({ ...valid, ALAIA_MONGO_TEST_URI: 'mongodb+srv://example.mongodb.net/?tls=false' }));
});
test('unapproved URI options rejected', () => assert.throws(() => validateConfig({ ...valid, ALAIA_MONGO_TEST_URI: 'mongodb+srv://example.mongodb.net/?tlsAllowInvalidCertificates=true' })));

test('invalid configuration reports a safe stage without loading MongoDB', async () => {
 await assert.rejects(main({}), error => {
  assert.deepEqual(formatFailure(error), { status: 'failed', failedStage: 'configuration', passed: [], numericCode: null, detailsSuppressed: true, syntheticDataRetained: true, doNotReuseDatabase: true });
  return true;
 });
});

test('unrecognized errors cannot inject messages, credentials, stages or results', () => {
 const error = Object.assign(new Error('PRIVATE_PASSWORD PRIVATE_URI'), { code: 'PRIVATE_CODE', failedStage: 'PRIVATE_STAGE', passed: ['PRIVATE_DOCUMENT'] });
 const result = formatFailure(error);
 assert.equal(result.failedStage, 'unknown');
 assert.deepEqual(result.passed, []);
 assert.equal(result.numericCode, null);
 assert.doesNotMatch(JSON.stringify(result), /PRIVATE_/);
});

// Execute the actual runner with in-memory substitutes; no driver or models are loaded.
function isolatedRunner(mongoose, imports = {}) {
 const source = fs.readFileSync(require.resolve('../scripts/mongo-phase5b-integration'), 'utf8');
 const module = { exports: {} };
 const localRequire = name => {
  if (name === 'node:assert/strict') return assert;
  if (name === 'node:crypto') return require('node:crypto');
  if (name === 'mongoose') return mongoose;
  if (name in imports) return imports[name];
  if (name.startsWith('../src/models/')) return { collection: { name: name.split('/').pop().toLowerCase() } };
  if (name === '../src/services/inventoryReservation') return {};
  if (name === '../src/services/checkoutLifecycle') return {};
  throw new Error('Unexpected test import');
 };
 const context = vm.createContext({ module, require: localRequire, URL, console: { log() { throw new Error('Unexpected success output'); }, error() { throw new Error('Unexpected output'); } } });
 vm.runInContext(source, context);
 return { ...module.exports, diagnosticFailure: vm.runInContext('diagnosticFailure', context) };
}
function fakeMongoose() {
 const calls = [];
 return {
  calls, set() {},
  async connect() { calls.push('connect'); },
  async disconnect() { calls.push('disconnect'); },
  connection: { name: db, db: {
   admin: () => ({ command: async () => ({ setName: 'fake', isWritablePrimary: true, logicalSessionTimeoutMinutes: 30 }) }),
   listCollections: () => ({ toArray: async () => [] }),
   async createCollection(name) { calls.push(`create:${name}`); }
  } }
 };
}

test('authentication failure reports only a numeric code and still disconnects', async () => {
 const mongoose = fakeMongoose();
 mongoose.connect = async () => { mongoose.calls.push('connect'); throw Object.assign(new Error('PRIVATE_PASSWORD PRIVATE_URI'), { code: 18, document: 'PRIVATE_DOCUMENT' }); };
 const runner = isolatedRunner(mongoose);
 await assert.rejects(runner.main(valid), error => {
  const result = runner.formatFailure(error);
  assert.equal(result.failedStage, 'connect');
  assert.equal(result.numericCode, 18);
  assert.equal(result.passed.length, 0);
  assert.doesNotMatch(JSON.stringify(result) + error.stack, /PRIVATE_/);
  return true;
 });
 assert.deepEqual(mongoose.calls, ['connect', 'disconnect']);
});

test('used database reports the exact preflight stage and never creates collections', async () => {
 const mongoose = fakeMongoose();
 mongoose.connection.db.listCollections = () => ({ toArray: async () => [{ name: 'PRIVATE_COLLECTION' }] });
 const runner = isolatedRunner(mongoose);
 await assert.rejects(runner.main(valid), error => {
  const result = runner.formatFailure(error);
  assert.equal(result.failedStage, 'unused database');
  assert.equal(result.numericCode, null);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_/);
  return true;
 });
 assert.deepEqual(mongoose.calls, ['connect', 'disconnect']);
});

test('collection failure retains its stage and code when disconnect also fails', async () => {
 const mongoose = fakeMongoose();
 mongoose.connection.db.createCollection = async name => {
  mongoose.calls.push(`create:${name}`);
  if (name === 'orden') throw Object.assign(new Error('PRIVATE_CREATE'), { code: 13 });
 };
 mongoose.disconnect = async () => { mongoose.calls.push('disconnect'); throw Object.assign(new Error('PRIVATE_CLOSE'), { code: 999 }); };
 const runner = isolatedRunner(mongoose);
 await assert.rejects(runner.main(valid), error => {
  const result = runner.formatFailure(error);
  assert.equal(result.failedStage, 'create Orden collection');
  assert.equal(result.numericCode, 13);
  assert.doesNotMatch(JSON.stringify(result) + error.stack, /PRIVATE_/);
  return true;
 });
 assert.deepEqual(mongoose.calls, ['connect', 'create:producto', 'create:orden', 'disconnect']);
});

test('index failure reports the index stage and does not serialize a string code', async () => {
 const mongoose = fakeMongoose();
 const imports = { '../src/models/Counter': { collection: { name: 'counter', createIndex: async () => { throw Object.assign(new Error('PRIVATE_INDEX'), { code: 'PRIVATE_CODE' }); } } } };
 const runner = isolatedRunner(mongoose, imports);
 await assert.rejects(runner.main(valid), error => {
  const result = runner.formatFailure(error);
  assert.equal(result.failedStage, 'create Counter index');
  assert.equal(result.numericCode, null);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_/);
  return true;
 });
});

test('E assertion diagnostics retain a snapshot of completed trials without assertion values', () => {
 const runner = isolatedRunner(fakeMongoose());
 const passed = ['A rollback', 'B commit', 'C concurrency', 'D counter failure'];
 const assertion = new assert.AssertionError({ actual: { secret: 'PRIVATE_DOCUMENT' }, expected: 'PRIVATE_PASSWORD', message: 'PRIVATE_URI' });
 const failure = runner.diagnosticFailure(assertion, 'E repeated release', passed);
 passed.push('E idempotent release');
 const result = runner.formatFailure(failure);
 assert.equal(result.failedStage, 'E repeated release');
 assert.equal(result.numericCode, null);
 assert.equal(JSON.stringify(result.passed), JSON.stringify(passed.slice(0, 4)));
 assert.doesNotMatch(JSON.stringify(result) + failure.stack, /PRIVATE_/);
});

test('diagnostics do not invoke code getters or disclose cleanup error fields', () => {
 const runner = isolatedRunner(fakeMongoose());
 const error = new Error('PRIVATE_URI');
 Object.defineProperty(error, 'code', { get() { throw new Error('PRIVATE_GETTER'); } });
 const failure = runner.diagnosticFailure(error, 'disconnect', ['A rollback']);
 const result = runner.formatFailure(failure);
 assert.equal(result.failedStage, 'disconnect');
 assert.equal(result.numericCode, null);
 assert.doesNotMatch(JSON.stringify(result), /PRIVATE_/);
});
