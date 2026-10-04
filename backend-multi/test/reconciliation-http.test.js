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
const morgan = require('morgan');
const { redactText } = require('../src/utils/safeLogging');
const { isReconciliationRequest, reconciliationLogFormat, reconciliationErrorLog } = require('../src/middleware/reconciliationLogging');
const { createReconciliationReadRuntime } = require('../src/services/reconciliationReadRuntime');
const { getReconciliationReadLimits } = require('../src/config/reconciliationReads');
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
const { fixture } = require('./reconciliationExpressHarness');

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
  assert.equal((await h.request('POST', `/${KEY}/reviews`, { origin: null, headers: { referer: ORIGIN }, body })).body.code, 'COOKIE_WRITE_ORIGIN_FORBIDDEN');
  for (const contentType of [null, 'text/plain', 'application/x-www-form-urlencoded']) assert.equal((await h.request('POST', `/${KEY}/reviews`, { contentType, raw: contentType === 'application/x-www-form-urlencoded' ? 'status=closed' : JSON.stringify(body) })).status, 415);
  assert.equal(h.audits.size, 0);
});
test('HTTP reconciliation: route origin guard is effective independently of global CORS', async t => {
  const h = await fixture(t, { globalCors: false });
  const result = await h.request('POST', `/${KEY}/reviews`, { origin: 'https://hostile.example.invalid', body: await h.input() });
  assert.equal(result.status, 403); assert.equal(result.body.code, 'COOKIE_WRITE_ORIGIN_FORBIDDEN');
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

const waitUntil = async predicate => {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.fail('Local state did not settle');
};
const readEnv = { ALAIA_RECONCILIATION_MAX_CONCURRENT_READS: '1', ALAIA_RECONCILIATION_READ_TIMEOUT_MS: '500' };
test('HTTP reconciliation: Morgan logs only fixed routes, methods and status even before auth rejection', async t => {
  const h = await fixture(t);
  await h.request('GET', '?email=PRIVATE_EMAIL&kind=order&kind=event', { session: null });
  await h.request('GET', '/PRIVATE_ADDRESS?unknown=PRIVATE_PASSWORD', { session: null });
  await h.request('POST', `/${KEY}/reviews?unknown=PRIVATE_PASSWORD`, { body: {} });
  await h.request('GET', '/PRIVATE_ADDRESS/PRIVATE_PASSWORD/action?email=PRIVATE_EMAIL');
  await h.request('GET', '', { path: 'http://local.invalid' + BASE + '?email=PRIVATE_EMAIL&kind=order&kind=event', session: null });
  await h.request('GET', '', { path: BASE.toUpperCase() + '/PRIVATE_ADDRESS?email=PRIVATE_EMAIL', session: null });
  assert.equal(h.logs.length, 6);
  for (const line of h.logs) {
    assert.doesNotMatch(line, /PRIVATE_|email|unknown|cookie|reqId|user-agent|\?|aaaaaaaa/);
    const row = JSON.parse(line); assert.deepEqual(Object.keys(row), ['method', 'route', 'status']);
    assert.ok([BASE, BASE + '/:caseKey', BASE + '/:caseKey/reviews', BASE + '/:unmatched'].includes(row.route));
  }
  const other = await h.request('GET', '', { path: '/http-fixture/query?kind=order' }); assert.equal(other.status, 200);
  assert.match(h.logs.at(-1), /GET \/http-fixture\/query\?kind=order HTTP\/1\.1/);
  assert.doesNotMatch(h.logs.at(-1), /"route":/);
});
test('HTTP reconciliation: saturation rejects generically and success/error release operation capacity', async t => {
  const h = await fixture(t, { readEnv }); const body = await h.input(); let release;
  h.state.listWait = new Promise(resolve => { release = resolve; });
  const pending = h.request('GET'); await waitUntil(() => h.reads.stats().operations === 1);
  assert.equal((await h.request('GET', '', { session: null })).status, 401);
  assert.equal((await h.request('GET', '', { session: h.token(CLIENT) })).status, 403);
  assert.equal((await h.request('POST', `/${KEY}/reviews`, { body })).status, 200);
  const busy = await h.request('GET', `/${KEY}`); assert.equal(busy.status, 503);
  assert.deepEqual(busy.body, { ok: false, code: 'REVIEW_READ_BUSY', financialActionsAllowed: false }); assert.equal(busy.headers['retry-after'], '1');
  h.state.listWait = null; release(); assert.equal((await pending).status, 200);
  assert.deepEqual(h.reads.stats(), { operations: 0, activeHTTP: 0 });
  h.state.fault = 'list'; assert.equal((await h.request('GET')).status, 503); assert.equal(h.reads.stats().operations, 0);
  h.state.fault = null; assert.equal((await h.request('GET')).status, 200);
});
test('HTTP reconciliation: Mongo maxTimeMS failures return sanitized 504 and release capacity', async t => {
  const h = await fixture(t, { readEnv }); h.state.mongoTimeout = true;
  const response = await h.request('GET'); assert.equal(response.status, 504);
  assert.deepEqual(response.body, { ok: false, code: 'REVIEW_READ_TIMEOUT', financialActionsAllowed: false });
  assert.equal(h.reads.stats().operations, 0); h.state.mongoTimeout = false;
  assert.equal((await h.request('GET')).status, 200);
});
test('HTTP reconciliation: HTTP deadline frees HTTP count but holds operation capacity until late settlement', async t => {
  const h = await fixture(t, { readEnv }); let release;
  h.state.listWait = new Promise(resolve => { release = resolve; });
  const response = await h.request('GET'); assert.equal(response.status, 504);
  assert.deepEqual(response.body, { ok: false, code: 'REVIEW_READ_TIMEOUT', financialActionsAllowed: false });
  assert.deepEqual(h.reads.stats(), { operations: 1, activeHTTP: 0 });
  assert.equal((await h.request('GET')).status, 503);
  h.state.listWait = null; release(); await waitUntil(() => h.reads.stats().operations === 0);
  assert.equal((await h.request('GET')).status, 200);
});
test('HTTP reconciliation: disconnection frees HTTP count but retains operation slot until database promise settles', async t => {
  const h = await fixture(t, { readEnv }); let release;
  h.state.listWait = new Promise(resolve => { release = resolve; });
  await h.disconnect(); await waitUntil(() => h.reads.stats().activeHTTP === 0);
  assert.equal(h.reads.stats().operations, 1); assert.equal((await h.request('GET')).status, 503);
  h.state.listWait = null; release(); await waitUntil(() => h.reads.stats().operations === 0);
  assert.equal((await h.request('GET')).status, 200);
});

test('HTTP reconciliation: malformed JSON with sensitive query is logged only as a fixed route', async t => {
  const h = await fixture(t);
  const response = await h.request('POST', `/${KEY}/reviews?email=PRIVATE_EMAIL`, { raw: '{"private":"PRIVATE_PASSWORD",', session: null });
  assert.equal(response.status, 400); assert.equal(h.logs.length, 1);
  assert.deepEqual(JSON.parse(h.logs[0]), { method: 'POST', route: BASE + '/:caseKey/reviews', status: 400 });
  assert.doesNotMatch(h.logs[0] + h.errorLogs.join(''), /PRIVATE_|aaaaaaaa|email|\?/);
  assert.equal(h.errorLogs.length, 1);
  assert.equal(JSON.parse(h.errorLogs[0])[0].code, 'REQUEST_BODY_INVALID');
});

test('HTTP reconciliation: detail deadline rejects generically and stops subsequent snapshot reads', async t => {
  const h = await fixture(t, { readEnv }); let release;
  h.state.detailWait = new Promise(resolve => { release = resolve; }); t.after(() => release());
  const response = await h.request('GET', `/${KEY}`);
  assert.equal(response.status, 504); assert.deepEqual(response.body, { ok: false, code: 'REVIEW_READ_TIMEOUT', financialActionsAllowed: false });
  assert.deepEqual(h.reads.stats(), { operations: 1, activeHTTP: 0 });
  assert.equal(h.state.repositoryCalls, 1);
  h.state.detailWait = null; release(); await waitUntil(() => h.reads.stats().operations === 0);
  assert.equal(h.state.repositoryCalls, 1); // No source/audit read after deadline.
  assert.equal((await h.request('GET', `/${KEY}`)).status, 200);
});

test('HTTP payout discovery: no flags, admin-only DTO, closing review preserves the live claim and payout barrier', async t => {
  const h = await fixture(t);
  const { sourceSnapshot } = require('../src/services/reconciliationContracts');
  const { queueCoverage } = require('../src/services/reconciliationRepository');
  const row = copy(h.business.orders.find(order => String(order._id) === ID));
  const obligation = `payout_obligation_${ID}_${SELLER}`;
  row.inventoryReservation = { state: 'consumed', needsReconciliation: false };
  row.payoutBlocked = false;
  row.historial = [{ estado: obligation, fecha: new Date('2026-10-04'),
    meta: { amount: 1500, currency: 'usd', destination: 'acct_fixture', password: 'PRIVATE_PAYOUT_SECRET' },
    note: 'PRIVATE_FULL_HISTORY' }];
  const before = copy({ business: h.business, row });
  h.repo.getSource = async reference => reference.key === KEY ? copy(row) : null;
  // Controlled repository selection; actual aggregation is covered structurally,
  // not represented as MongoDB execution by this loopback HTTP test.
  h.repo.list = async options => {
    const reference = parseKey(KEY), record = h.cases.get(reference.caseId);
    const dto = caseDTO(reference, record, row);
    const selected = sourceSnapshot('order', row).operationalPending &&
      (!options.kind || options.kind === 'order') && (!options.status || options.status === dto.administrativeStatus);
    const items = selected ? [dto] : [];
    return { items: items.slice((options.page - 1) * options.limit, options.page * options.limit),
      total: items.length, coverage: queueCoverage(options, items.length) };
  };
  for (const session of [null, h.token(CLIENT), h.token(SELLER)]) {
    const result = await h.request('GET', `/${KEY}`, { session });
    assert.ok([401, 403].includes(result.status)); assert.ok(!result.text.includes(obligation));
  }
  const initial = await h.request('GET', '?kind=order&page=1&limit=1');
  assert.equal(initial.body.data.total, 1);
  assert.equal(initial.body.data.items[0].source.pendingPayouts[0].obligationId, obligation);
  assert.equal(initial.body.data.items[0].source.payoutReviewLabel, 'Resultado de payout pendiente de verificar');
  const input = await h.input({ status: 'closed', conclusion: 'no_operational_resolution' });
  const closed = await h.request('POST', `/${KEY}/reviews`, { body: input }); assert.equal(closed.status, 200);
  const listed = await h.request('GET', '?kind=order&status=closed');
  assert.equal(listed.body.data.total, 1); assert.equal(listed.body.data.items[0].source.operationalPending, true);
  assert.equal((await h.request('GET')).body.data.total, 1);
  const filtered = await h.request('GET', '?kind=order&status=open');
  assert.equal(filtered.body.data.total, 0); assert.equal(filtered.body.data.coverage.administrativeStatus, 'open');
  const secondPage = await h.request('GET', '?kind=order&page=2&limit=1');
  assert.equal(secondPage.body.data.total, 1); assert.equal(secondPage.body.data.items.length, 0);
  assert.deepEqual({ business: h.business, row }, before);
  assert.equal(require('../src/models/Orden').hydrate(row).isPayoutEligible(), false);
  for (const result of [initial, closed, listed, filtered, secondPage]) assert.doesNotMatch(result.text, /PRIVATE_|historial|password/);
  assert.doesNotMatch(JSON.stringify([h.logs, h.errorLogs]), /PRIVATE_PAYOUT_SECRET|PRIVATE_FULL_HISTORY/);
});
