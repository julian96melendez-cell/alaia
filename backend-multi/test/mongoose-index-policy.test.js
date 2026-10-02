'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const environments = [undefined, 'development', 'test', 'production'];
const utilities = ['reset-admin-password.js', 'resetPassword.js', 'scripts/crearAdminTemporal.js'];
const optionalUtility = 'scripts/crearAdminTemporal.js';
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

function sandbox(environment, failConnection = false) {
  const settings = {}, connections = [], calls = [];
  let disconnected;
  const settled = new Promise(resolve => { disconnected = resolve; });
  const mongoose = {
    set(key, value) { settings[key] = value; },
    async connect(uri, options) {
      connections.push({ uri, options });
      if (failConnection) throw Error('Synthetic connection failure');
    },
    // Simulate a failed connection with local resources still requiring cleanup.
    connection: { readyState: failConnection ? 1 : 0 },
    async disconnect() { calls.push('disconnect'); disconnected(); },
  };
  for (const method of ['createConnection', 'createCollection', 'createIndex', 'createIndexes', 'ensureIndexes', 'syncIndexes', 'cleanIndexes', 'dropIndex', 'dropIndexes']) {
    mongoose[method] = () => { calls.push(method); throw Error('Forbidden database effect'); };
  }
  const env = {
    MONGO_URI: 'synthetic-uri-only', RESET_PASSWORD_EMAIL: 'fixture@example.invalid',
    RESET_PASSWORD_NEW_PASSWORD: 'synthetic-only-password-123456',
    ADMIN_BOOTSTRAP_EMAIL: 'fixture@example.invalid',
    ADMIN_BOOTSTRAP_PASSWORD: 'synthetic-only-password-123456',
    ...(environment === undefined ? {} : { NODE_ENV: environment }),
  };
  const module = { exports: {} };
  const context = {
    module, exports: module.exports, process: { env, exitCode: 0 },
    console: { log() {}, error() {}, warn() {} },
    require(name) {
      if (name === 'mongoose') return mongoose;
      if (name === 'dotenv') return { config() {} };
      if (name.endsWith('/safeLogging')) return { installSafeLogging() {} };
      if (name.endsWith('/models/Usuario')) {
        assert.deepEqual(settings, { autoIndex: false, autoCreate: false });
        return new Proxy({}, { get() { calls.push('model-operation'); throw Error('Forbidden model operation'); } });
      }
      throw Error('Forbidden dependency');
    },
  };
  return { context, module, settings, connections, calls, settled };
}

test('shared connection explicitly disables index/collection creation in every environment', async () => {
  for (const environment of environments) {
    const fake = sandbox(environment);
    vm.runInNewContext(read('src/config/db.js'), fake.context);
    await fake.module.exports();
    assert.equal(fake.connections.length, 1);
    assert.equal(fake.connections[0].uri, 'synthetic-uri-only');
    assert.deepEqual(JSON.parse(JSON.stringify(fake.connections[0].options)), {
      serverSelectionTimeoutMS: 10000, autoIndex: false, autoCreate: false,
    });
    assert.deepEqual(fake.calls, []);
  }
});

for (const utility of utilities) {
  const skip = utility === optionalUtility && !fs.existsSync(path.join(root, utility))
    ? 'NO VERIFICADO: crearAdminTemporal.js es una utilidad local ignorada y no existe'
    : false;
  test(`${utility} protects model compilation and connection without real dependencies`, { skip }, async () => {
    for (const environment of environments) {
      const fake = sandbox(environment, true);
      vm.runInNewContext(read(utility), fake.context);
      await fake.settled;
      assert.equal(fake.connections.length, 1);
      assert.deepEqual(JSON.parse(JSON.stringify(fake.connections[0].options)), {
        autoIndex: false, autoCreate: false,
      });
      assert.equal(fake.context.process.exitCode, 1);
      assert.deepEqual(fake.calls, ['disconnect']);
    }
    assert.doesNotMatch(read(utility), /\.(?:init|createCollection|createIndex|createIndexes|ensureIndexes|syncIndexes|cleanIndexes|dropIndex|dropIndexes)\s*\(/);
  });
}

test('protected operational connections do not invoke explicit index or collection operations', () => {
  // The optional utility's scan belongs to its explicitly skippable test above.
  for (const file of ['src/config/db.js', ...utilities.filter(file => file !== optionalUtility)]) {
    assert.doesNotMatch(read(file), /\.(?:init|createCollection|createIndex|createIndexes|ensureIndexes|syncIndexes|cleanIndexes|dropIndex|dropIndexes)\s*\(/);
  }
});

test('isolated integration connections keep their own explicit protections', () => {
  for (const file of ['scripts/mongo-phase5b-integration.js', 'scripts/mongo-reconciliation-review-integration.js', 'scripts/mongo-native-reconciliation-reader-integration.js', 'scripts/mongo-express-native-reconciliation-integration.js']) {
    const source = read(file);
    assert.match(source, /autoCreate: false/);
    assert.match(source, /autoIndex: false/);
    assert.doesNotMatch(source, /require\(['"](?:\.\.\/)?src\/config\/db['"]\)/);
  }
  const isolated = read('scripts/reconciliation-integration/isolatedRuntime.js');
  assert.match(isolated, /new Mongoose\(\)/);
  assert.match(isolated, /mongoose\.set\('autoIndex', false\)/);
  assert.match(isolated, /mongoose\.set\('autoCreate', false\)/);
});
