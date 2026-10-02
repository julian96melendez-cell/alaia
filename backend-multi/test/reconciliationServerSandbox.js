'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), http = require('node:http'), util = require('node:util');
const realExpress = require('express');
const { createReconciliationReaderLifecycle } = require('../src/services/reconciliationReaderLifecycle');
const { acquireSandboxGuard } = require('./reconciliationSandboxGuard');
const { createDriverDouble } = require('./reconciliationNativeDriverDouble');
function startServerSandbox({ env, state, routerModule, business, cases, audits, logs, errorLogs }) {
  const guard = acquireSandboxGuard();
  try {
  const { createNativeReconciliationReader } = require('../src/services/reconciliationNativeReader');
  const events = [], exits = [], signals = new Map(), denied = [], consoles = [];
  const driver = createDriverDouble({ state, business, cases, audits });
  const connection = { name: 'express_fixture', readyState: 0 };
  let server, owner, app, httpClosed = Promise.resolve();
  const consoleDouble = {};
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'dir']) consoleDouble[method] = (...args) => {
    const line = util.format(...args); consoles.push(line); if (method === 'error') errorLogs.push(line);
  };
  const safeModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/utils/safeLogging.js'), 'utf8'), {
    module: safeModule, process: { env }, console: consoleDouble,
    require: name => { assert.equal(name, 'util'); return util; }
  });
  const expressDouble = Object.assign(function () {
    app = realExpress();
    app.listen = (_port, _host, callback) => {
      events.push('listen'); server = http.createServer(app);
      httpClosed = new Promise(resolve => server.once('close', resolve));
      server.listen(0, '127.0.0.1', callback); guard.allow(server); return server;
    };
    return app;
  }, realExpress);
  const routeSentinel = (req, res, next) => {
    if (state.globalError) {
      if (state.headersSentError) res.write('fixture');
      return next(state.globalError);
    }
    return res.status(404).json({ ok: false, message: 'Not found' });
  };
  const models = { Orden: 'orders', WebhookEvent: 'events', ReconciliationCase: 'cases', ReconciliationAudit: 'audits' };
  const allowedPackages = new Set(['crypto', 'cors', 'morgan', 'helmet', 'express-rate-limit', 'express-mongo-sanitize', 'hpp', 'cookie-parser']);
  const allowedModules = new Set(['./src/config/cors', './src/middleware/reconciliationLogging', './src/middleware/reconciliationQueryGuard', './src/config/readiness']);
  const replacements = {
    dotenv: { config() { events.push('dotenv:disabled'); } },
    './src/utils/safeLogging': safeModule.exports, express: expressDouble,
    './src/config/cors': { getAllowedOrigins: () => require('../src/config/cors').getAllowedOrigins(env), createOriginValidator: require('../src/config/cors').createOriginValidator },
    mongoose: { connection },
    './src/config/db': async () => {
      events.push('main:start'); if (state.mainGate) await state.mainGate.promise;
      if (state.mainError) throw state.mainError; connection.readyState = 1; events.push('main:ready');
    },
    './src/routes/adminReconciliationRoutes': routerModule,
    './src/services/reconciliationReaderLifecycle': { createReconciliationReaderLifecycle() {
      owner = createReconciliationReaderLifecycle({ env, createReader: options => {
        state.reader = createNativeReconciliationReader({ ...options, driver: driver.driver }); return state.reader;
      } }); return owner;
    } }
  };
  const processDouble = { env, stdout: { write: line => logs.push(line) }, uptime: () => 0,
    on(name, callback) { signals.set(name, callback); }, exit(code) { exits.push(code); } };
  const context = { module: { exports: {} }, __startup: undefined, process: processDouble,
    console: consoleDouble, Buffer, setTimeout(callback, ms) {
      assert.equal(ms, 10000); const timer = { callback, canceled: false, unref() {} }; state.watchdog = timer; return timer;
    }, clearTimeout(timer) { if (timer) timer.canceled = true; },
    require(name) {
      if (Object.hasOwn(replacements, name)) return replacements[name];
      const model = name.match(/^\.\/src\/models\/(\w+)$/)?.[1];
      if (Object.hasOwn(models, model)) return { collection: { name: models[model] } };
      if (/^\.\/src\/routes\//.test(name)) return routeSentinel;
      if (allowedPackages.has(name)) return require(name);
      if (allowedModules.has(name)) return require(path.join(__dirname, '..', name));
      denied.push(name); throw Error('Forbidden sandbox import');
    }
  };
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.equal(source.split('(async () => {').length, 2);
  // Evaluate every server statement. Only capture its startup promise; no fragments.
  vm.runInNewContext(source.replace('(async () => {', '__startup = (async () => {'), context, { filename: 'server.js (isolated sandbox)' });
  return { startup: context.__startup, server: () => server, app: () => app, owner: () => owner,
    events, exits, denied, consoles, driver, connection, releaseGuard: () => guard.release(), httpClosed: () => httpClosed,
    signal(name = 'SIGTERM') { assert.ok(signals.has(name)); signals.get(name)(); },
    force() { assert.ok(state.watchdog); state.watchdog.callback(); }
  };
  } catch (error) { guard.release(); throw error; }
}
module.exports = { startServerSandbox };
