'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const { isReconciliationRequest, reconciliationLogFormat, reconciliationErrorLog } = require('../src/middleware/reconciliationLogging');
const { createReconciliationReadRuntime } = require('../src/services/reconciliationReadRuntime');
const { getReconciliationReadLimits } = require('../src/config/reconciliationReads');
const { rejectAmbiguousReconciliationQuery } = require('../src/middleware/reconciliationQueryGuard');
const { getAllowedOrigins, createOriginValidator } = require('../src/config/cors');
const { createReconciliationReviewService } = require('../src/services/reconciliationReviewService');
const { parseKey, caseDTO, fail, pendingPayoutClaims } = require('../src/services/reconciliationContracts');
const { queueCoverage } = require('../src/services/reconciliationRepository');
const BASE = '/api/ordenes/admin/reconciliation';
const ORIGIN = 'https://admin.example.invalid';
const COOKIE = 'alaia_access_token';
const ID = 'aaaaaaaaaaaaaaaaaaaaaaaa', ADMIN = 'bbbbbbbbbbbbbbbbbbbbbbbb', OTHER = 'cccccccccccccccccccccccc';
const CLIENT = 'dddddddddddddddddddddddd', SELLER = 'eeeeeeeeeeeeeeeeeeeeeeee';
const KEY = `order:${ID}`, EVENT = `event:${OTHER}`, IDEM = 'http-review-idempotency-00001';
const copy = value => value == null ? value : structuredClone(value);
const serverSource = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
function moduleWithDoubles(relative, replacements, env, consoleTarget) {
  const filename = path.join(__dirname, '..', relative), module = { exports: {} };
  const localRequire = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, process: { env }, Date, URL,
    console: consoleTarget || { error() { throw Error('Uncaptured fixture console channel'); } },
    require: name => {
      if (Object.hasOwn(replacements, name)) return replacements[name];
      assert.ok(['express', 'jsonwebtoken', './reconciliationContracts', '../services/reconciliationContracts'].includes(name), `Unexpected infrastructure import: ${name}`);
      return localRequire(name);
    },
  }, { filename });
  return module.exports;
}
async function fixture(t, { globalCors = true, readEnv = {}, integrated = false, nativeFlag = undefined, pendingStart = false, nativePlan = {}, mainGate, mainError, nodeEnv = 'production' } = {}) {
  const reads = createReconciliationReadRuntime(getReconciliationReadLimits(readEnv)), logs = [], errorLogs = [];
  const env = { ACCESS_COOKIE_NAME: COOKIE, JWT_SECRET: crypto.randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: crypto.randomBytes(32).toString('hex'), CORS_ALLOWED_ORIGINS: ORIGIN, ...readEnv };
  if (integrated) {
    env.NODE_ENV = nodeEnv; env.API_WORKERS_ENABLED = 'false'; env.MONGO_URI = 'mongodb://127.0.0.1/express_fixture';
    if (nativeFlag !== undefined) env.ALAIA_RECONCILIATION_NATIVE_READER_ENABLED = nativeFlag;
  }
  const { redactText } = moduleWithDoubles('src/utils/safeLogging.js', { util: require('node:util') }, env);
  const capturedConsole = { error: (...args) => errorLogs.push(JSON.stringify(args)) };
  const users = new Map([[ADMIN, { _id: ADMIN, rol: 'admin', activo: true, tokenVersion: 1, email: 'PRIVATE_AUTH_EMAIL', password: 'PRIVATE_AUTH_PASSWORD' }], [OTHER, { _id: OTHER, rol: 'admin', activo: true, tokenVersion: 1 }], [CLIENT, { _id: CLIENT, rol: 'usuario', activo: true, tokenVersion: 1 }], [SELLER, { _id: SELLER, rol: 'vendedor', activo: true, tokenVersion: 1 }]]);
  const business = {
    orders: [{ _id: ID, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'),
      inventoryReservation: { state: 'reserved', needsReconciliation: true, lines: [{ producto: ID, cantidad: 1 }] },
      checkoutIntent: { keyHash: 'PRIVATE_HASH', stripeCorrelation: 'PRIVATE_BINDING' }, estadoPago: 'pendiente', estadoFulfillment: 'pendiente', payoutBlocked: true,
      total: 10, moneda: 'usd', clienteEmail: 'PRIVATE_EMAIL', direccionEntrega: { street: 'PRIVATE_ADDRESS' }, vendedorPayouts: [{ status: 'bloqueado' }] }],
    events: [{ _id: OTHER, provider: 'stripe', status: 'failed', eventId: 'evt_fixture', updatedAt: new Date('2026-01-02'), ordenId: ID, raw: { password: 'PRIVATE_PASSWORD' }, errorMessage: 'PRIVATE_DRIVER_ERROR' }],
    products: [{ _id: ID, stock: 7 }], counters: [{ key: 'order', seq: 11 }], payouts: [{ status: 'bloqueado', amount: 3 }],
  };
  const originalBusiness = copy(business), cases = new Map(), audits = new Map();
  const state = { lock: Promise.resolve(), auditGate: null, fault: null, repositoryCalls: 0, mongooseReads: 0, mongooseReviews: 0, nativePlan, mainGate, mainError };
  const fault = stage => { if (state.fault === stage) throw Error('PRIVATE_PASSWORD PRIVATE_DRIVER_ERROR mongodb+srv://PRIVATE_URI PRIVATE_ADDRESS'); };
  const repo = {
    getCase: async id => { state.repositoryCalls++; fault('detail'); if (state.detailWait) await state.detailWait; return copy(cases.get(id)); },
    getSource: async reference => { state.repositoryCalls++; return copy((reference.kind === 'order' ? business.orders : business.events).find(row => row._id === reference.id)); },
    getAudit: async (id, session) => {
      state.repositoryCalls++; fault('review'); const value = copy(audits.get(id)), gate = state.auditGate;
      if (!session && gate && gate.remaining > 0) {
        gate.remaining--; if (gate.remaining === 0) { clearTimeout(gate.timer); gate.release(); }
        await gate.wait;
      }
      return value;
    },
    writeCase: async (record, expected, session) => {
      assert.ok(session);
      if ((cases.get(record._id)?.version || 0) !== expected) throw fail('REVIEW_STALE_VERSION', 409);
      cases.set(record._id, copy(record));
    },
    createAudit: async (record, session) => {
      assert.ok(session); fault('audit');
      if (audits.has(record._id)) throw Object.assign(Error('duplicate'), { code: 11000 });
      const saved = { ...copy(record), createdAt: integrated ? new Date('2026-10-02T00:00:00.000Z') : new Date() }; audits.set(record._id, saved); return saved;
    },
    listAudits: async (id, options) => {
      state.repositoryCalls++;
      const rows = [...audits.values()].filter(row => row.caseId === id).sort((a, b) => b.resultVersion - a.resultVersion);
      return { items: copy(rows.slice((options.page - 1) * options.limit, options.page * options.limit)), total: rows.length };
    },
    transaction: async fn => {
      const previous = state.lock; let release; state.lock = new Promise(resolve => { release = resolve; }); await previous;
      const beforeCases = copy(cases), beforeAudits = copy(audits);
      try { return await fn({ active: true }); }
      catch (error) { cases.clear(); audits.clear(); for (const [id, row] of beforeCases) cases.set(id, row); for (const [id, row] of beforeAudits) audits.set(id, row); throw error; }
      finally { release(); }
    },
    list: async options => {
      state.repositoryCalls++; fault('list');
      if (state.listWait) await state.listWait;
      if (state.mongoTimeout) throw Object.assign(Error('PRIVATE_DRIVER_ERROR'), { code: 50 });
      const keys = new Set([...business.orders.filter(row => row.inventoryReservation?.needsReconciliation || row.inventoryReservation?.state === 'reconciliation_required' || pendingPayoutClaims(row).length > 0).map(row => `order:${row._id}`), ...business.events.filter(row => row.provider === 'stripe' && ['failed', 'skipped'].includes(row.status)).map(row => `event:${row._id}`), ...[...cases.values()].filter(row => row.status !== 'closed').map(row => row.caseKey)]);
      const items = [];
      for (const key of [...keys].sort()) {
        const reference = parseKey(key), dto = caseDTO(reference, cases.get(reference.caseId), await repo.getSource(reference));
        if ((!options.kind || options.kind === dto.sourceKind) && (!options.status || options.status === dto.administrativeStatus)) items.push(dto);
      }
      return { items: items.slice((options.page - 1) * options.limit, options.page * options.limit), total: items.length, readConsistency: 'single_aggregation', coverage: queueCoverage(options, items.length) };
    },
  };
  repo.readSnapshot = fn => repo.transaction(fn);
  const service = createReconciliationReviewService(repo);
  const mongooseService = {
    list(...args) { state.mongooseReads++; return service.list(...args); },
    detail(...args) { state.mongooseReads++; return service.detail(...args); },
    review(...args) { state.mongooseReviews++; return service.review(...args); }
  };
  const Usuario = { findById: id => ({ select: async projection => {
    assert.equal(projection, '+tokenVersion +lockedUntil -password');
    if (state.fault === 'auth') throw Error('PRIVATE_PASSWORD PRIVATE_DRIVER_ERROR');
    const user = copy(users.get(String(id)));
    if (user) delete user.password;
    return user;
  } }) };
  const authService = moduleWithDoubles('src/services/authService.js', { '../models/Usuario': Usuario }, env);
  const cookieOrigin = moduleWithDoubles('src/middleware/cookieWriteOrigin.js', { '../config/cors': require('../src/config/cors') }, env);
  const auth = moduleWithDoubles('src/middleware/auth.js', { './cookieWriteOrigin': cookieOrigin, '../models/Usuario': Usuario, '../services/authService': authService, './reconciliationLogging': require('../src/middleware/reconciliationLogging') }, env, capturedConsole);
  const controller = moduleWithDoubles('src/controllers/adminReconciliationController.js', {
    '../services/reconciliationReviewService': { getReconciliationReviewService: () => mongooseService },
    '../services/reconciliationReadRuntime': { createReconciliationReadRuntime: () => reads },
    '../config/cors': { getAllowedOrigins: () => getAllowedOrigins(env) },
  }, env);
  const router = moduleWithDoubles('src/routes/adminReconciliationRoutes.js', { '../middleware/auth': auth, '../controllers/adminReconciliationController': controller }, env);
  let app, server, sandbox;
  if (integrated) {
    sandbox = require('./reconciliationServerSandbox').startServerSandbox({ env, state, routerModule: router, business, cases, audits, logs, errorLogs });
    app = sandbox.app();
    if (!pendingStart) await sandbox.startup;
    server = sandbox.server();
    if (server && !server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  } else {
  app = express(); app.disable('x-powered-by');
  // Reuse production middleware definitions without evaluating its startup/SDK imports.
  if (globalCors) {
    const start = serverSource.indexOf('app.use(\n  cors({'), end = serverSource.indexOf('\n);', start) + 3;
    assert.ok(start > 0 && end > start);
    vm.runInNewContext(serverSource.slice(start, end), { app, cors, createOriginValidator, ALLOWED_ORIGINS: getAllowedOrigins(env) });
  }
  const loggingStart = serverSource.indexOf('morgan.token("reqId"');
  const loggingEnd = serverSource.indexOf('const limiterBaseConfig', loggingStart);
  assert.ok(loggingStart > 0 && loggingEnd > loggingStart);
  vm.runInNewContext(serverSource.slice(loggingStart, loggingEnd), { app, morgan, isProd: true, redactText, isReconciliationRequest, reconciliationLogFormat, process: { stdout: { write: line => logs.push(line) } } });
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' })); app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  const normalizeStart = serverSource.indexOf('app.use("/api/ordenes/admin/reconciliation", rejectAmbiguousReconciliationQuery);');
  const sanitizeStart = serverSource.indexOf('app.use(\n  mongoSanitize({');
  assert.ok(normalizeStart > 0 && normalizeStart < sanitizeStart);
  const hppStart = serverSource.indexOf('app.use(\n  hpp({', normalizeStart);
  const normalizeEnd = serverSource.indexOf('\n);', hppStart) + 3;
  assert.ok(normalizeStart > 0 && normalizeEnd > normalizeStart);
  vm.runInNewContext(serverSource.slice(normalizeStart, normalizeEnd), { app, mongoSanitize, hpp, rejectAmbiguousReconciliationQuery });
  app.get('/http-fixture/query', (req, res) => res.json({ query: req.query }));
  app.get(BASE + '-other', (req, res) => res.json({ query: req.query }));
  app.use(BASE, router);
  // A generic fallback sentinel verifies middleware on unknown reconciliation paths.
  app.use('/api/ordenes', (req, res) => res.status(404).json({ ok: false, message: 'Not found' }));
  const errorStart = serverSource.indexOf('app.use((err, req, res, next) => {');
  const errorEnd = serverSource.indexOf('\n});', errorStart) + 4;
  assert.ok(errorStart > 0 && errorEnd > errorStart);
  vm.runInNewContext(serverSource.slice(errorStart, errorEnd), { app, isProd: true, isReconciliationRequest, reconciliationErrorLog, console: { error: (...args) => errorLogs.push(JSON.stringify(args)) } });
  server = http.createServer(app);
  server.requestTimeout = 5000; server.headersTimeout = 6000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  }
  t.after(async () => {
    try {
      if (state.auditGate) { clearTimeout(state.auditGate.timer); state.auditGate.release(); }
      if (integrated) {
        sandbox.signal();
        state.mainGate?.resolve();
        for (const action of Object.values(state.nativePlan)) action?.resolve?.();
        await sandbox.startup;
        await sandbox.owner().close().catch(() => {});
        await sandbox.httpClosed();
        assert.deepEqual(sandbox.denied, []);
      } else if (server?.listening) {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
      assert.deepEqual(business, originalBusiness);
    } finally { sandbox?.releaseGuard(); }
  });
  const token = id => authService.generarTokens(users.get(id)).accessToken;
  async function request(method, suffix = '', options = {}) {
    server = sandbox ? sandbox.server() : server;
    assert.ok(server?.listening, 'Fixture HTTP not available');
    const session = Object.hasOwn(options, 'session') ? options.session : token(ADMIN);
    const origin = Object.hasOwn(options, 'origin') ? options.origin : ORIGIN;
    const headers = { ...options.headers };
    if (session) headers.cookie = `${COOKIE}=${session}`;
    if (origin != null) headers.origin = origin;
    const body = Object.hasOwn(options, 'raw') ? options.raw : options.body === undefined ? undefined : JSON.stringify(options.body);
    if (body !== undefined) {
      if (options.contentType !== null) headers['content-type'] = options.contentType || 'application/json';
      headers['content-length'] = Buffer.byteLength(body);
    }
    if (method === 'POST' && !Object.hasOwn(headers, 'idempotency-key')) headers['idempotency-key'] = IDEM;
    const response = await new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: server.address().port, method, path: options.path || BASE + suffix, headers, agent: false }, res => {
        let text = ''; res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; });
        res.on('end', () => { try { resolve({ status: res.statusCode, headers: res.headers, text, body: text ? JSON.parse(text) : null }); } catch (error) { reject(error); } });
      });
      req.setTimeout(5000, () => req.destroy(Error('Local HTTP timeout'))); req.on('error', reject); req.end(body);
    });
    assert.deepEqual(business, originalBusiness);
    const wire = response.text + JSON.stringify(response.headers);
    if (session && session.includes('.')) assert.ok(!wire.includes(session), 'Session token leaked over HTTP');
    for (const key of [env.JWT_SECRET, env.JWT_REFRESH_SECRET]) assert.ok(!wire.includes(key), 'Signing key leaked over HTTP');
    assert.doesNotMatch(response.text, /PRIVATE_|mongodb(?:\+srv)?:\/\/|stripeCorrelation|direccionEntrega|clienteEmail|operationHash|requestHash|stack/);
    assert.doesNotMatch(logs.join('') + errorLogs.join('') + (sandbox?.consoles.join('') || ''), /PRIVATE_|mongodb(?:\+srv)?:\/\/|direccionEntrega|clienteEmail|operationHash|requestHash/);
    return response;
  }
  async function input(overrides = {}) {
    const detail = await request('GET', `/${KEY}`); assert.equal(detail.status, 200);
    return { expectedVersion: detail.body.data.version, sourceVersion: detail.body.data.sourceVersion, status: 'under_review', conclusion: 'awaiting_evidence', evidence: [{ kind: 'internal_ticket', reference: 'OPS-HTTP' }], ...overrides };
  }
  function concurrentReads() {
    let release, reject; const wait = new Promise((resolve, fail) => { release = resolve; reject = fail; });
    const timer = setTimeout(() => reject(Error('Concurrent requests did not reach barrier')), 4000);
    state.auditGate = { remaining: 2, wait, release, timer };
  }
  async function disconnect() {
    let poll, timer;
    try {
      await new Promise((resolve, reject) => {
        server = sandbox ? sandbox.server() : server;
        const req = http.request({ hostname: '127.0.0.1', port: server.address().port, method: 'GET', path: BASE, headers: { origin: ORIGIN, cookie: `${COOKIE}=${token(ADMIN)}` }, agent: false });
        req.on('error', () => resolve());
        req.on('response', res => { res.resume(); reject(Error('Fixture request completed before disconnect admission')); });
        timer = setTimeout(() => { req.destroy(); reject(Error('Fixture disconnect deadline')); }, 5000);
        req.end();
        poll = setInterval(() => { if ((state.reader?.stats() || reads.stats()).operations > 0) { clearInterval(poll); req.destroy(); } }, 2);
      });
    } finally { clearInterval(poll); clearTimeout(timer); }
  }
  return { request, input, token, env, users, business, cases, audits, state, concurrentReads, reads, logs, errorLogs, disconnect, sandbox, service, repo };
}


module.exports = { fixture, BASE, ORIGIN, COOKIE, ID, ADMIN, OTHER, CLIENT, SELLER, KEY, EVENT, IDEM };
