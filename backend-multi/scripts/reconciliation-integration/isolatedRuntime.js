'use strict';
// Runner-only loader: actual source, isolated module cache/Mongoose/environment.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const allowed = new Set([
  'models/Usuario', 'models/Orden', 'models/Counter', 'models/WebhookEvent', 'models/ReconciliationCase', 'models/ReconciliationAudit',
  'services/authService', 'services/orderInvariants', 'services/financialQueryGuard', 'services/reconciliationContracts',
  'services/reconciliationRepository', 'services/reconciliationReviewService', 'services/reconciliationReadRuntime',
  'services/reconciliationNativeReader', 'services/reconciliationReaderLifecycle',
  'middleware/auth', 'middleware/cookieWriteOrigin', 'middleware/reconciliationLogging', 'middleware/reconciliationQueryGuard',
  'controllers/adminReconciliationController', 'routes/adminReconciliationRoutes',
  'config/reconciliationNativeReader', 'config/reconciliationReads', 'config/cors', 'config/readiness', 'utils/safeLogging',
]);
const collections = Object.freeze({ Usuario: 'express_users', Orden: 'express_orders', Counter: 'express_counters', WebhookEvent: 'express_events', ReconciliationCase: 'express_cases', ReconciliationAudit: 'express_audits' });
function createIsolatedRuntime({ Mongoose, driver, database }) {
  const mongoose = new Mongoose(), cache = new Map(), logs = [], errors = [];
  mongoose.set('autoCreate', false); mongoose.set('autoIndex', false); mongoose.set('bufferCommands', false);
  mongoose.set('debug', false);
  const model = mongoose.model.bind(mongoose);
  mongoose.model = (name, schema) => {
    if (!Object.hasOwn(collections, name)) throw Error('Forbidden isolated model');
    if (schema) { schema.set('autoCreate', false); schema.set('autoIndex', false); schema.set('bufferCommands', false); }
    return model(name, schema, collections[name]);
  };
  const env = Object.freeze({ NODE_ENV: 'test', ACCESS_COOKIE_NAME: 'alaia_access_token', JWT_SECRET: crypto.randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: crypto.randomBytes(32).toString('hex'), CORS_ALLOWED_ORIGINS: 'https://admin.example.invalid', ALAIA_RECONCILIATION_READ_TIMEOUT_MS: '8000', ALAIA_RECONCILIATION_MONGO_MAX_TIME_MS: '2000', ALAIA_RECONCILIATION_MAX_CONCURRENT_READS: '1' });
  const capturedConsole = { error: (...args) => errors.push(require('node:util').format(...args)), log: (...args) => logs.push(require('node:util').format(...args)), warn: (...args) => logs.push(require('node:util').format(...args)) };
  let connectionErrorSeen = false;
  mongoose.connection.on('error', () => { connectionErrorSeen = true; errors.push('MONGOOSE_CONNECTION_ERROR'); });
  const packages = new Set(['express', 'jsonwebtoken', 'bcryptjs', 'crypto', 'node:crypto', 'node:perf_hooks', 'util']);
  function load(label) {
    if (!allowed.has(label)) throw Error('Forbidden isolated module');
    if (cache.has(label)) return cache.get(label).exports;
    const module = { exports: {} }; cache.set(label, module);
    vm.runInNewContext(fs.readFileSync(path.join(root, 'src', label + '.js'), 'utf8'), {
      module, exports: module.exports, process: { env }, console: capturedConsole, Date, URL, URLSearchParams, Buffer, setTimeout, clearTimeout,
      require(name) {
        if (name === 'mongoose') return mongoose;
        if (name === 'mongodb') return driver;
        if (name === 'mongodb/package.json') return { version: '7.0.0' };
        if (packages.has(name)) return require(name);
        if (name.startsWith('.')) return load(path.posix.normalize(path.posix.join(path.posix.dirname(label), name)).replace(/\.js$/, ''));
        throw Error('Forbidden isolated dependency');
      },
    }, { filename: label + '.js (isolated integration)' });
    return module.exports;
  }
  const models = Object.fromEntries(Object.keys(collections).map(name => [name, load('models/' + name)]));
  const repo = load('services/reconciliationRepository').createMongoRepository({ mongoose, Orden: models.Orden, WebhookEvent: models.WebhookEvent, Case: models.ReconciliationCase, Audit: models.ReconciliationAudit });
  const service = load('services/reconciliationReviewService').createReconciliationReviewService(repo);
  const authService = load('services/authService');
  let writes = 0; const pending = new Set();
  const provider = Object.fromEntries(['list', 'detail', 'review'].map(method => [method, (...args) => {
    if (method === 'review') writes++;
    const work = Promise.resolve().then(() => service[method](...args)); pending.add(work);
    return work.finally(() => pending.delete(work));
  }]));
  return { mongoose, models, repo, service, env, logs, errors, load, database, collections,
    writes: () => writes, pendingWork: () => pending.size, connectionErrorSeen: () => connectionErrorSeen,
    async drain() { while (pending.size) await Promise.allSettled([...pending]); },
    token: user => authService.generarTokens(user).accessToken,
    controller: () => load('controllers/adminReconciliationController').createAdminReconciliationController(() => provider),
  };
}
module.exports = { createIsolatedRuntime, collections };
