'use strict';
const test = require('node:test');
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
const { rejectAmbiguousReconciliationQuery } = require('../src/middleware/reconciliationQueryGuard');
const { getAllowedOrigins, createOriginValidator } = require('../src/config/cors');
const { createReconciliationReviewService } = require('../src/services/reconciliationReviewService');
const { parseKey, caseDTO, fail } = require('../src/services/reconciliationContracts');
const BASE = '/api/ordenes/admin/reconciliation';
const ORIGIN = 'https://admin.example.invalid';
const COOKIE = 'alaia_access_token';
const ID = 'aaaaaaaaaaaaaaaaaaaaaaaa', ADMIN = 'bbbbbbbbbbbbbbbbbbbbbbbb', OTHER = 'cccccccccccccccccccccccc';
const CLIENT = 'dddddddddddddddddddddddd', SELLER = 'eeeeeeeeeeeeeeeeeeeeeeee';
const KEY = `order:${ID}`, EVENT = `event:${OTHER}`, IDEM = 'http-review-idempotency-00001';
const copy = value => value == null ? value : structuredClone(value);
const serverSource = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
function moduleWithDoubles(relative, replacements, env) {
  const filename = path.join(__dirname, '..', relative), module = { exports: {} };
  const localRequire = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, process: { env }, Date, URL,
    console: { error() {} }, // Never emit injected storage diagnostics or tokens.
    require: name => {
      if (Object.hasOwn(replacements, name)) return replacements[name];
      assert.ok(['express', 'jsonwebtoken', './reconciliationContracts', '../services/reconciliationContracts'].includes(name), `Unexpected infrastructure import: ${name}`);
      return localRequire(name);
    },
  }, { filename });
  return module.exports;
}
async function fixture(t, { globalCors = true } = {}) {
  const env = { ACCESS_COOKIE_NAME: COOKIE, JWT_SECRET: crypto.randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: crypto.randomBytes(32).toString('hex'), CORS_ALLOWED_ORIGINS: ORIGIN };
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
  const state = { lock: Promise.resolve(), auditGate: null, fault: null, repositoryCalls: 0 };
  const fault = stage => { if (state.fault === stage) throw Error('PRIVATE_PASSWORD PRIVATE_DRIVER_ERROR mongodb+srv://PRIVATE_URI PRIVATE_ADDRESS'); };
  const repo = {
    getCase: async id => { state.repositoryCalls++; fault('detail'); return copy(cases.get(id)); },
    getSource: async reference => copy((reference.kind === 'order' ? business.orders : business.events).find(row => row._id === reference.id)),
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
      const saved = { ...copy(record), createdAt: new Date() }; audits.set(record._id, saved); return saved;
    },
    listAudits: async (id, options) => {
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
      const keys = new Set([...business.orders.filter(row => row.inventoryReservation.needsReconciliation || row.inventoryReservation.state === 'reconciliation_required').map(row => `order:${row._id}`), ...business.events.filter(row => row.provider === 'stripe' && ['failed', 'skipped'].includes(row.status)).map(row => `event:${row._id}`), ...[...cases.values()].filter(row => row.status !== 'closed').map(row => row.caseKey)]);
      const items = [];
      for (const key of [...keys].sort()) {
        const reference = parseKey(key), dto = caseDTO(reference, cases.get(reference.caseId), await repo.getSource(reference));
        if ((!options.kind || options.kind === dto.sourceKind) && (!options.status || options.status === dto.administrativeStatus)) items.push(dto);
      }
      return { items: items.slice((options.page - 1) * options.limit, options.page * options.limit), total: items.length, readConsistency: 'single_aggregation' };
    },
  };
  repo.readSnapshot = fn => repo.transaction(fn);
  const service = createReconciliationReviewService(repo);
  const Usuario = { findById: id => ({ select: async projection => {
    assert.equal(projection, '+tokenVersion +lockedUntil -password');
    if (state.fault === 'auth') throw Error('PRIVATE_PASSWORD PRIVATE_DRIVER_ERROR');
    const user = copy(users.get(String(id)));
    if (user) delete user.password;
    return user;
  } }) };
  const authService = moduleWithDoubles('src/services/authService.js', { '../models/Usuario': Usuario }, env);
  const auth = moduleWithDoubles('src/middleware/auth.js', { '../models/Usuario': Usuario, '../services/authService': authService }, env);
  const controller = moduleWithDoubles('src/controllers/adminReconciliationController.js', {
    '../services/reconciliationReviewService': { getReconciliationReviewService: () => service },
    '../config/cors': { getAllowedOrigins: () => getAllowedOrigins(env) },
  }, env);
  const router = moduleWithDoubles('src/routes/adminReconciliationRoutes.js', { '../middleware/auth': auth, '../controllers/adminReconciliationController': controller }, env);
  const app = express(); app.disable('x-powered-by');
  // Reuse production middleware definitions without evaluating its startup/SDK imports.
  if (globalCors) {
    const start = serverSource.indexOf('app.use(\n  cors({'), end = serverSource.indexOf('\n);', start) + 3;
    assert.ok(start > 0 && end > start);
    vm.runInNewContext(serverSource.slice(start, end), { app, cors, createOriginValidator, ALLOWED_ORIGINS: getAllowedOrigins(env) });
  }
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
  vm.runInNewContext(serverSource.slice(errorStart, errorEnd), { app, isProd: true, console: { error() {} } });
  const server = http.createServer(app);
  server.requestTimeout = 5000; server.headersTimeout = 6000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => {
    if (state.auditGate) { clearTimeout(state.auditGate.timer); state.auditGate.release(); }
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    assert.deepEqual(business, originalBusiness);
  });
  const token = id => authService.generarTokens(users.get(id)).accessToken;
  async function request(method, suffix = '', options = {}) {
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
  return { request, input, token, env, users, business, cases, audits, state, concurrentReads };
}

test('HTTP reconciliation: every read/write and unknown path rejects missing sessions and non-admin users', async t => {
  const h = await fixture(t), body = await h.input();
  for (const [session, status] of [[null, 401], [h.token(CLIENT), 403], [h.token(SELLER), 403]]) {
    for (const [method, suffix] of [['GET', ''], ['GET', `/${KEY}`], ['POST', `/${KEY}/reviews`], ['POST', `/${KEY}/resolve`]]) assert.equal((await h.request(method, suffix, { session, body: method === 'POST' ? body : undefined })).status, status);
  }
  assert.equal(h.cases.size, 0); assert.equal(h.audits.size, 0);
});
test('HTTP reconciliation: real JWT/cookie auth rejects invalid, expired, refresh, revoked and disabled sessions', async t => {
  const h = await fixture(t), valid = h.token(ADMIN);
  const invalid = ['invalid', jwt.sign({ id: ADMIN, type: 'access', exp: 1 }, h.env.JWT_SECRET), jwt.sign({ id: ADMIN, type: 'refresh' }, h.env.JWT_SECRET), jwt.sign({ id: 'ffffffffffffffffffffffff', type: 'access' }, h.env.JWT_SECRET)];
  for (const session of invalid) assert.equal((await h.request('GET', '', { session })).status, 401);
  assert.equal((await h.request('GET', '', { session: valid, headers: { authorization: 'Bearer invalid' } })).status, 401);
  for (const [patch, status] of [[{ tokenVersion: 2 }, 401], [{ activo: false }, 403], [{ bloqueado: true }, 403], [{ lockedUntil: new Date(Date.now() + 60000) }, 403], [{ rol: 'usuario' }, 403]]) {
    h.users.set(ADMIN, { _id: ADMIN, rol: 'admin', activo: true, tokenVersion: 1, ...patch });
    assert.equal((await h.request('GET', '', { session: valid })).status, status);
  }
  h.state.fault = 'auth'; assert.equal((await h.request('GET', '', { session: valid })).status, 401);
});
test('HTTP reconciliation: CORS preflight grants no data or writes; permitted responses allow credentials', async t => {
  const h = await fixture(t);
  const preflight = await h.request('OPTIONS', `/${KEY}/reviews`, { session: null, headers: { 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,idempotency-key' } });
  assert.equal(preflight.status, 204); assert.equal(preflight.body, null); assert.equal(h.state.repositoryCalls, 0);
  assert.equal(preflight.headers['access-control-allow-origin'], ORIGIN); assert.equal(preflight.headers['access-control-allow-credentials'], 'true');
  const result = await h.request('GET'); assert.equal(result.status, 200); assert.equal(result.headers['cache-control'], 'no-store');
});
test('HTTP reconciliation: cookie writes reject missing/null/hostile origins and form content types', async t => {
  const h = await fixture(t), body = await h.input();
  for (const origin of [null, 'null', 'https://hostile.example.invalid', `${ORIGIN}/path`, 'http://admin.example.invalid']) assert.equal((await h.request('POST', `/${KEY}/reviews`, { origin, body })).status, 403);
  assert.equal((await h.request('POST', `/${KEY}/reviews`, { origin: null, headers: { referer: ORIGIN }, body })).body.code, 'REVIEW_ORIGIN_FORBIDDEN');
  for (const contentType of [null, 'text/plain', 'application/x-www-form-urlencoded']) assert.equal((await h.request('POST', `/${KEY}/reviews`, { contentType, raw: contentType === 'application/x-www-form-urlencoded' ? 'status=closed' : JSON.stringify(body) })).status, 415);
  assert.equal(h.audits.size, 0);
});
test('HTTP reconciliation: route origin guard is effective independently of global CORS', async t => {
  const h = await fixture(t, { globalCors: false });
  const result = await h.request('POST', `/${KEY}/reviews`, { origin: 'https://hostile.example.invalid', body: await h.input() });
  assert.equal(result.status, 403); assert.equal(result.body.code, 'REVIEW_ORIGIN_FORBIDDEN');
  assert.equal(h.cases.size, 0);
});
test('HTTP reconciliation: strict parameters, query operators, unknown fields and pagination bounds reject requests', async t => {
  const h = await fixture(t);
  for (const suffix of ['?page=0', '?limit=101', '?page=1000&limit=100', '?limit=1&limit=2', '?page[$gt]=0', '?page=1.5', '?unknown=1', '?kind=unknown', '?status=paid', '?status=open&status=closed']) assert.equal((await h.request('GET', suffix)).status, 400, suffix);
  for (const key of ['order:bad', `order:${ID.toUpperCase()}`, `event:${ID}\n`]) assert.equal((await h.request('GET', `/${encodeURIComponent(key)}`)).status, 400);
  assert.equal((await h.request('GET', '/order:ffffffffffffffffffffffff')).status, 404);
  assert.equal((await h.request('GET', `/${KEY}?kind=order`)).status, 400);
  assert.equal((await h.request('POST', `/${KEY}/reviews?page=1`, { body: await h.input() })).status, 400);
});
test('HTTP reconciliation: strict review bodies and idempotency keys reject financial fields and sensitive/free-text evidence', async t => {
  const h = await fixture(t), input = await h.input();
  const variants = [[], {}, { ...input, estadoPago: 'pagado' }, { ...input, inventoryReservation: { state: 'released' } }, { ...input, estadoFulfillment: 'enviado' }, { ...input, actorId: OTHER }, { ...input, note: 'PRIVATE_ADDRESS' }, { ...input, expectedVersion: '0' }, { ...input, sourceVersion: 'bad' }, { ...input, status: 'paid' }, { ...input, evidence: [] }, { ...input, evidence: [{ kind: 'stripe_object', reference: 'pi_fixture_secret_PRIVATE_PASSWORD' }] }, { ...input, evidence: [{ kind: 'internal_ticket', reference: 'person@example.invalid' }] }, { ...input, evidence: [input.evidence[0], input.evidence[0]] }, { ...input, $set: { estadoPago: 'pagado' } }];
  for (const body of variants) assert.equal((await h.request('POST', `/${KEY}/reviews`, { body })).status, 400);
  for (const key of ['', 'short', 'x'.repeat(129)]) assert.equal((await h.request('POST', `/${KEY}/reviews`, { body: input, headers: { 'idempotency-key': key } })).status, 400);
  assert.equal(h.cases.size, 0); assert.equal(h.audits.size, 0);
});
test('HTTP reconciliation: malformed JSON, oversized bodies and invalid URI encoding return sanitized parser errors', async t => {
  const h = await fixture(t);
  const invalid = await h.request('POST', `/${KEY}/reviews`, { raw: '{"PRIVATE_PASSWORD":' });
  assert.equal(invalid.status, 400); assert.equal(invalid.body.message, 'Error interno del servidor');
  assert.equal((await h.request('POST', `/${KEY}/reviews`, { raw: JSON.stringify({ note: 'x'.repeat(1024 * 1024) }) })).status, 413);
  assert.equal((await h.request('GET', '/%FF')).status, 400); assert.equal(h.cases.size, 0);
});
test('HTTP reconciliation: read DTOs are private, paginated, independent and create no administrative records', async t => {
  const h = await fixture(t), page = await h.request('GET', '?page=1&limit=1');
  assert.equal(page.body.data.total, 2); assert.equal(page.body.data.items.length, 1); assert.equal(page.body.data.limit, 1);
  const events = await h.request('GET', '?kind=event'); assert.equal(events.body.data.items[0].sourceKind, 'event');
  assert.doesNotMatch(JSON.stringify(events.body), /ordenId|raw|errorMessage/);
  const detail = await h.request('GET', `/${KEY}`); assert.equal(detail.body.data.readConsistency, 'snapshot'); assert.equal(detail.body.data.version, 0);
  assert.equal(h.cases.size, 0); assert.equal(h.audits.size, 0);
});
test('HTTP reconciliation: administrative close changes only case/audit and leaves fulfillment, finance and inventory blocked', async t => {
  const h = await fixture(t);
  const result = await h.request('POST', `/${KEY}/reviews`, { body: await h.input({ status: 'closed', conclusion: 'payment_confirmed' }) });
  assert.equal(result.status, 200); assert.equal(result.body.data.financialActionsAllowed, false); assert.equal(result.body.data.review.actorId, ADMIN);
  const detail = await h.request('GET', `/${KEY}`); assert.equal(detail.body.data.administrativeStatus, 'closed'); assert.equal(detail.body.data.source.needsReconciliation, true);
  assert.equal(detail.body.data.source.paymentState, 'pendiente'); assert.equal(detail.body.data.source.fulfillmentState, 'pendiente'); assert.equal(detail.body.data.source.reservationState, 'reserved'); assert.equal(detail.body.data.source.payoutBlocked, true);
  assert.equal((await h.request('GET', '?status=closed')).body.data.total, 1); assert.equal(h.audits.size, 1);
});
test('HTTP reconciliation: exact retries replay original evidence after later review; changed payload conflicts', async t => {
  const h = await fixture(t), first = await h.input();
  await h.request('POST', `/${KEY}/reviews`, { body: first });
  await h.request('POST', `/${KEY}/reviews`, { body: await h.input({ status: 'closed', conclusion: 'discrepancy' }), headers: { 'idempotency-key': IDEM + '-later' } });
  const replay = await h.request('POST', `/${KEY}/reviews`, { body: first });
  assert.equal(replay.status, 200); assert.equal(replay.body.data.replayed, true); assert.equal(replay.body.data.review.version, 1);
  const conflict = await h.request('POST', `/${KEY}/reviews`, { body: { ...first, conclusion: 'discrepancy' } }); assert.equal(conflict.status, 409); assert.equal(conflict.body.code, 'REVIEW_IDEMPOTENCY_CONFLICT');
  assert.equal(h.audits.size, 2); assert.equal((await h.request('GET', `/${KEY}`)).body.data.version, 2);
});
test('HTTP reconciliation: simultaneous identical requests append one audit', async t => {
  const h = await fixture(t), body = await h.input(); h.concurrentReads();
  const results = await Promise.all([h.request('POST', `/${KEY}/reviews`, { body }), h.request('POST', `/${KEY}/reviews`, { body })]);
  assert.deepEqual(results.map(row => row.status), [200, 200]); assert.equal(results.filter(row => row.body.data.replayed).length, 1);
  assert.equal(h.audits.size, 1); assert.equal(h.cases.size, 1); assert.equal(h.state.auditGate.remaining, 0);
});
test('HTTP reconciliation: two authenticated reviewers with one version yield one commit and one conflict', async t => {
  const h = await fixture(t), body = await h.input(); h.concurrentReads();
  const results = await Promise.all([h.request('POST', `/${KEY}/reviews`, { body }), h.request('POST', `/${KEY}/reviews`, { body, session: h.token(OTHER) })]);
  assert.deepEqual(results.map(row => row.status).sort(), [200, 409]); assert.equal(results.find(row => row.status === 409).body.code, 'REVIEW_STALE_VERSION');
  assert.equal(h.audits.size, 1); const detail = await h.request('GET', `/${KEY}`); assert.equal(detail.body.data.version, 1); assert.equal(detail.body.data.auditTotal, 1);
});
test('HTTP reconciliation: stale source/version cannot append or overwrite an administrative review', async t => {
  const h = await fixture(t), first = await h.input();
  const stale = await h.request('POST', `/${KEY}/reviews`, { body: { ...first, sourceVersion: 'f'.repeat(64) } }); assert.equal(stale.status, 409);
  await h.request('POST', `/${KEY}/reviews`, { body: first });
  const old = await h.request('POST', `/${KEY}/reviews`, { body: first, headers: { 'idempotency-key': IDEM + '-stale' } }); assert.equal(old.status, 409); assert.equal(old.body.code, 'REVIEW_STALE_VERSION'); assert.equal(h.audits.size, 1);
});
test('HTTP reconciliation: storage errors return fixed 503, rollback case changes and never expose diagnostics', async t => {
  const h = await fixture(t), body = await h.input();
  for (const [stage, method, suffix] of [['list', 'GET', ''], ['detail', 'GET', `/${KEY}`], ['review', 'POST', `/${KEY}/reviews`], ['audit', 'POST', `/${KEY}/reviews`]]) {
    h.state.fault = stage;
    const result = await h.request(method, suffix, { body: method === 'POST' ? body : undefined });
    assert.equal(result.status, 503); assert.deepEqual(result.body, { ok: false, code: 'REVIEW_UNAVAILABLE', financialActionsAllowed: false });
    assert.equal(h.cases.size, 0); assert.equal(h.audits.size, 0);
  }
});
test('HTTP reconciliation: unsupported financial actions have no route', async t => {
  const h = await fixture(t);
  for (const action of ['resolve', 'release', 'pay', 'payout', 'refund', 'fulfill']) assert.equal((await h.request('POST', `/${KEY}/${action}`, { body: {} })).status, 404);
  for (const method of ['PATCH', 'DELETE']) assert.equal((await h.request(method, `/${KEY}`, { body: {} })).status, 404);
  assert.equal(h.cases.size, 0); assert.equal(h.audits.size, 0);
});

test('HTTP reconciliation: raw duplicate and nested query names fail before HPP, including encoded aliases', async t => {
  const h = await fixture(t);
  const invalid = [
    'kind=order&kind=event', 'kind=event&kind=order', 'kind=order&%6bind=event',
    'page=1&page=2', 'limit=1&limit=2', 'status=open&status=closed',
    'kind[]=event', 'kind=order&kind[0]=event', 'kind=order&kind%5B%5D=event',
    'page[0]=1', 'limit[]=1', 'status[$ne]=closed', 'unknown=x&unknown=y',
  ];
  for (const query of invalid) {
    for (const [method, suffix] of [['GET', ''], ['GET', `/${KEY}`], ['POST', `/${KEY}/reviews`]]) {
      const response = await h.request(method, suffix + '?' + query, { body: method === 'POST' ? {} : undefined });
      assert.equal(response.status, 400, query);
      assert.deepEqual(response.body, { ok: false, code: 'REVIEW_AMBIGUOUS_QUERY', financialActionsAllowed: false });
      assert.equal(response.headers['cache-control'], 'no-store');
    }
  }
  // Malformed transport input is rejected before authentication, without persistence access.
  assert.equal((await h.request('GET', '?kind=order&kind=event', { session: null })).status, 400);
  assert.equal(h.state.repositoryCalls, 0); assert.equal(h.cases.size, 0); assert.equal(h.audits.size, 0);
});
test('HTTP reconciliation: scalar filters still work and other routes retain existing HPP behavior', async t => {
  const h = await fixture(t);
  for (const kind of ['order', 'event']) {
    const response = await h.request('GET', `?kind=${kind}&page=1&limit=1`);
    assert.equal(response.status, 200); assert.equal(response.body.data.items[0].sourceKind, kind);
  }
  for (const path of ['/http-fixture/query', BASE + '-other']) {
    const response = await h.request('GET', '', { path: path + '?kind=order&kind=event&page=1&page=2' });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.query, { kind: 'event', page: ['1', '2'] });
  }
  // Express mount matching also covers case variants and trailing slashes.
  for (const path of [BASE.toUpperCase(), BASE + '/']) {
    assert.equal((await h.request('GET', '', { path: path + '?kind=order&kind=event' })).status, 400);
  }
});
