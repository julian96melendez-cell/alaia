'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const runner = require('../scripts/mongo-reconciliation-review-integration');
const database = 'alaia_0123456789abcdef0123456789abcdef';
// Deliberately fake credential/host; tests never connect.
const env = (overrides = {}) => ({ ALAIA_MONGO_TEST_DB: database, ALAIA_MONGO_TEST_CONFIRM: database, ALAIA_MONGO_TEST_URI: `mongodb+srv://alaia_integration_test:fixture%40only@fixture.mongodb.net/${database}?authSource=admin&w=majority`, ...overrides });
const auth = (overrides = {}) => ({ authInfo: { authenticatedUsers: [{ user: 'alaia_integration_test', db: 'admin' }], authenticatedUserRoles: [{ role: 'readWrite', db: database }], authenticatedUserPrivileges: [{ resource: { db: database, collection: '' }, actions: ['find', 'insert'] }], ...overrides } });
function sandbox(Client) {
  const filename = path.join(__dirname, '../scripts/mongo-reconciliation-review-integration.js'), module = { exports: {} }, localRequire = createRequire(filename); let driverImports = 0;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, URL, Set, WeakMap, process: { env: {} }, require: name => {
    if (name === 'mongoose') { driverImports++; return { Mongoose: Client }; }
    assert.ok(!name.startsWith('../src/models/'), 'Models must not load before isolation passes');
    return localRequire(name);
  } });
  return { runner: module.exports, imports: () => driverImports };
}
test('reconciliation runner: strict explicit test configuration accepts only the dedicated user/database', () => {
  assert.equal(runner.validateConfig(env()).db, database);
  for (const patch of [{ ALAIA_MONGO_TEST_DB: 'backendmulti' }, { ALAIA_MONGO_TEST_CONFIRM: '' }, { ALAIA_MONGO_TEST_URI: '' }, { NODE_ENV: 'production' }, { MONGO_URI: 'fixture-production' }, { STRIPE_SECRET_KEY: 'fixture-production' }]) assert.throws(() => runner.validateConfig(env(patch)), /details suppressed/);
});
test('reconciliation runner: previously attempted bases and URI scope overrides are rejected', () => {
  for (const db of ['alaia_78943cf524ef883d31e9628163931fe8', 'alaia_ba98fd0d1a69e51e79c3bd384d23916c', 'alaia_integration_ef588efb1b388be659120f9c1b6254cc']) assert.throws(() => runner.validateConfig(env({ ALAIA_MONGO_TEST_DB: db, ALAIA_MONGO_TEST_CONFIRM: db })));
  const valid = env().ALAIA_MONGO_TEST_URI;
  for (const uri of [valid.replace('alaia_integration_test', 'alaia'), valid.replace('alaia_integration_test', 'julian96melendez_db_user'), valid.replace(database, 'backendmulti'), valid.replace(database, ''), valid.replace('fixture%40only', ''), valid + '&tls=false', valid + '&w=1', valid + '&authSource=admin', valid + '#fragment', valid + '&replicaSet=override']) assert.throws(() => runner.validateConfig(env({ ALAIA_MONGO_TEST_URI: uri })));
});
test('reconciliation runner: malformed credentials/errors cannot disclose URI or secrets', async () => {
  const secret = 'fixture-password-marker';
  const h = sandbox(class { set() {} async connect() { throw Error(secret); } async disconnect() {} });
  try { await h.runner.main(env()); assert.fail('must fail'); } catch (error) {
    assert.doesNotMatch(error.message + JSON.stringify(h.runner.formatFailure(error)), /fixture-password-marker|mongodb|fixture%40only/);
    assert.equal(h.runner.formatFailure(error).failedStage, 'connect');
  }
});
test('reconciliation runner: invalid configuration never imports driver or connects', async () => {
  const h = sandbox(class { constructor() { assert.fail('No connection permitted'); } });
  await assert.rejects(h.runner.main(env({ ALAIA_MONGO_TEST_CONFIRM: '' })));
  assert.equal(h.imports(), 0);
});
test('reconciliation runner: consumed review database is rejected before driver import despite a matching URI', async () => {
  const db = 'alaia_faf7a4d2651ecd5fb67539a6eb5889ad';
  const config = env({ ALAIA_MONGO_TEST_DB: db, ALAIA_MONGO_TEST_CONFIRM: db,
    ALAIA_MONGO_TEST_URI: env().ALAIA_MONGO_TEST_URI.replace(database, db) });
  assert.throws(() => runner.validateConfig(config), /details suppressed/);
  const h = sandbox(class { constructor() { assert.fail('Consumed database must not connect'); } });
  try { await h.runner.main(config); assert.fail('must reject consumed database'); }
  catch (error) { assert.equal(h.runner.formatFailure(error).failedStage, 'configuration'); }
  assert.equal(h.imports(), 0);
});
test('reconciliation runner: effective privileges reject production access and broader roles', () => {
  runner.validatePrivileges(auth(), database);
  for (const patch of [{ authenticatedUserRoles: [{ role: 'readWriteAnyDatabase', db: 'admin' }] }, { authenticatedUserRoles: [{ role: 'readWrite', db: database }, { role: 'read', db: 'backendmulti' }] }, { authenticatedUserPrivileges: [{ resource: { db: 'backendmulti', collection: '' }, actions: ['find'] }] }, { authenticatedUserPrivileges: [{ resource: { anyResource: true }, actions: ['find'] }] }, { authenticatedUserPrivileges: [] }, { authenticatedUsers: [{ user: 'alaia', db: 'admin' }] }]) assert.throws(() => runner.validatePrivileges(auth(patch), database));
});
test('reconciliation runner: existing collections prevent model loading and every write', async () => {
  let disconnected = 0, writes = 0;
  const db = { admin: () => ({ command: async cmd => cmd.connectionStatus ? auth() : { setName: 'fixture', isWritablePrimary: true, logicalSessionTimeoutMinutes: 30, maxWireVersion: 13 } }), listCollections: () => ({ toArray: async () => [{ name: 'existing-empty-collection' }] }), createCollection: () => { writes++; } };
  const h = sandbox(class { constructor() { this.connection = { name: database, db }; } set() {} async connect(uri, options) { assert.equal(options.dbName, database); assert.equal(options.autoIndex, false); assert.equal(options.autoCreate, false); } async disconnect() { disconnected++; } });
  try { await h.runner.main(env()); assert.fail('must fail'); } catch (error) { assert.equal(h.runner.formatFailure(error).failedStage, 'unused database'); }
  assert.equal(writes, 0); assert.equal(disconnected, 1);
});
test('reconciliation runner: authorization failure precedes listCollections and any write', async () => {
  const h = sandbox(class { constructor() { this.connection = { name: database, db: { admin: () => ({ command: async () => auth({ authenticatedUserRoles: [{ role: 'atlasAdmin', db: 'admin' }] }) }), listCollections: () => assert.fail('Not permitted') } }; } set() {} async connect() {} async disconnect() {} });
  try { await h.runner.main(env()); assert.fail('must fail'); } catch (error) { assert.equal(h.runner.formatFailure(error).failedStage, 'effective privileges'); }
});
test('reconciliation runner: an attempted fresh database cannot be reused in the same process', async () => {
  let connections = 0;
  const db = { admin: () => ({ command: async cmd => cmd.connectionStatus ? auth() : { setName: 'fixture', isWritablePrimary: true, logicalSessionTimeoutMinutes: 30, maxWireVersion: 13 } }), listCollections: () => ({ toArray: async () => [] }) };
  const h = sandbox(class { constructor() { this.connection = { name: database, db }; } set() {} async connect() { connections++; } async disconnect() {} });
  // Provisioning is deliberately unavailable in this mock; no real writes occur.
  await assert.rejects(h.runner.main(env()));
  try { await h.runner.main(env()); assert.fail('must reject reuse'); } catch (error) { assert.equal(h.runner.formatFailure(error).failedStage, 'configuration'); }
  assert.equal(connections, 1);
});
test('reconciliation runner: concurrent single-use marker collision prevents all fixture/model work', async () => {
  let inserted = 0, created = 0;
  const db = { admin: () => ({ command: async cmd => cmd.connectionStatus ? auth() : { setName: 'fixture', isWritablePrimary: true, logicalSessionTimeoutMinutes: 30, maxWireVersion: 13 } }), listCollections: () => ({ toArray: async () => [] }), createCollection: async name => { assert.equal(name, 'alaia_reconciliation_review_run'); created++; }, collection: name => ({ insertOne: async record => { inserted++; assert.equal(record._id, 'single-use'); throw Object.assign(Error('synthetic duplicate'), { code: 11000 }); } }) };
  const h = sandbox(class { constructor() { this.connection = { name: database, db }; } set() {} async connect() {} async disconnect() {} });
  try { await h.runner.main(env()); assert.fail('must fail'); } catch (error) { const result = h.runner.formatFailure(error); assert.equal(result.failedStage, 'claim isolated database'); assert.equal(result.numericCode, 11000); }
  assert.equal(created, 1); assert.equal(inserted, 1);
});
