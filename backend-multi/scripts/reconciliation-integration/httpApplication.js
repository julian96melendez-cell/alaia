'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), http = require('node:http'), crypto = require('node:crypto');
const BASE = '/api/ordenes/admin/reconciliation', ORIGIN = 'https://admin.example.invalid';
function createHttpApplication(runtime, { enabled, uri, driver, signal, primaryReady = () => runtime.mongoose.connection.readyState === 1 }) {
  if (typeof enabled !== 'boolean') throw Error('Explicit isolated reader selection required');
  const express = require('express'), app = express(), logs = [], errors = [];
  let nativeReader;
  const lifecycle = runtime.load('services/reconciliationReaderLifecycle').createReconciliationReaderLifecycle({
    env: { ...runtime.env, ALAIA_RECONCILIATION_NATIVE_READER_ENABLED: enabled ? 'true' : 'false' },
    createReader: options => (nativeReader = runtime.load('services/reconciliationNativeReader').createNativeReconciliationReader({ ...options, driver })),
  });
  const source = fs.readFileSync(path.resolve(__dirname, '../../server.js'), 'utf8');
  const corsConfig = runtime.load('config/cors'), logging = runtime.load('middleware/reconciliationLogging');
  const context = { app, cors: require('cors'), morgan: require('morgan'), mongoSanitize: require('express-mongo-sanitize'), hpp: require('hpp'),
    ALLOWED_ORIGINS: corsConfig.getAllowedOrigins(runtime.env), createOriginValidator: corsConfig.createOriginValidator,
    isProd: true, ...logging, rejectAmbiguousReconciliationQuery: runtime.load('middleware/reconciliationQueryGuard').rejectAmbiguousReconciliationQuery,
    redactText: runtime.load('utils/safeLogging').redactText,
    process: { stdout: { write: line => logs.push(line) } }, console: { error: (...args) => errors.push(require('node:util').format(...args)) },
  };
  const fragment = (start, end, offset = 0) => {
    const from = source.indexOf(start, offset), until = source.indexOf(end, from + start.length);
    if (from < 0 || until < 0) throw Error('Production middleware correspondence changed');
    vm.runInNewContext(source.slice(from, until + end.length), context);
    return until + end.length;
  };
  app.disable('x-powered-by'); app.disable('etag');
  app.use((req, res, next) => { req.reqId = crypto.randomUUID(); res.setHeader('x-request-id', req.reqId); next(); });
  fragment('app.use(\n  cors({', '\n);');
  const from = source.indexOf('morgan.token("reqId"'), until = source.indexOf('const limiterBaseConfig', from);
  if (from < 0 || until < 0) throw Error('Production logging correspondence changed');
  vm.runInNewContext(source.slice(from, until), context);
  app.use(require('cookie-parser')()); app.use(express.json({ limit: '1mb' })); app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  const guard = source.indexOf('app.use("/api/ordenes/admin/reconciliation", rejectAmbiguousReconciliationQuery);');
  const hpp = source.indexOf('app.use(\n  hpp({', guard), end = source.indexOf('\n);', hpp);
  if (guard < 0 || hpp < 0 || end < 0) throw Error('Production query guard correspondence changed');
  vm.runInNewContext(source.slice(guard, end + 3), context);
  const controller = runtime.controller();
  let server, startup, closing, stopped = false; const pendingRequests = new Set();
  app.use(BASE, (req, res, next) => {
    if (stopped && ['GET', 'HEAD'].includes(req.method)) return res.status(503).json({ ok: false, code: 'REVIEW_UNAVAILABLE', financialActionsAllowed: false });
    next();
  });
  const connection = { uri, database: runtime.database, collectionNames: { orders: runtime.collections.Orden, events: runtime.collections.WebhookEvent, cases: runtime.collections.ReconciliationCase, audits: runtime.collections.ReconciliationAudit } };
  const onAbort = () => { stopped = true; application.close().catch(() => {}); };
  const application = {
    lifecycle, logs, errors, app, stats: () => nativeReader?.stats(), server: () => server,
    start() {
      if (signal?.aborted || stopped) return Promise.reject(Error('HTTP fixture stopped'));
      if (!startup) startup = (async () => {
        if (!primaryReady()) throw Error('Primary integration connection unavailable');
        await lifecycle.initialize(connection); if (stopped) throw Error('HTTP fixture stopped');
        if (!primaryReady()) throw Error('Primary integration connection unavailable');
        app.get('/readyz', runtime.load('config/readiness').createReadinessHandler(runtime.mongoose.connection));
        app.use(BASE, runtime.load('routes/adminReconciliationRoutes').createAdminReconciliationRouter({ readHandlers: lifecycle.handlers(), controller }));
        app.use((req, res) => res.status(404).json({ ok: false }));
        fragment('app.use((err, req, res, next) => {', '\n});');
        if (stopped) throw Error('HTTP fixture stopped');
        server = http.createServer(app); server.requestTimeout = 5000; server.headersTimeout = 6000;
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      })();
      return startup;
    },
    listening: () => Boolean(server?.listening),
    async request(method, suffix = '', { token, body, raw, origin = ORIGIN, headers = {}, route } = {}) {
      if (!server?.listening) throw Error('HTTP fixture unavailable');
      const data = raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body);
      headers = { ...headers }; if (token) headers.cookie = 'alaia_access_token=' + token;
      if (origin !== null) headers.origin = origin;
      if (data !== undefined) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(data); }
      const work = new Promise((resolve, reject) => {
        const req = http.request({ hostname: '127.0.0.1', port: server.address().port, method, path: route || BASE + suffix, headers, agent: false }, res => {
          let text = ''; res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; });
          res.on('aborted', () => reject(Error('HTTP fixture aborted')));
          res.on('end', () => { try { resolve({ status: res.statusCode, headers: res.headers, text, body: text ? JSON.parse(text) : null }); } catch { reject(Error('Invalid HTTP fixture response')); } });
        });
        req.setTimeout(15000, () => req.destroy(Error('HTTP fixture timeout'))); req.on('error', reject); req.end(data);
      });
      pendingRequests.add(work);
      try { return await work; } finally { pendingRequests.delete(work); }
    },
    close() {
      if (closing) return closing; stopped = true;
      // Admission closes immediately; local cleanup is never raced or detached.
      const reader = lifecycle.close();
      closing = (async () => {
        await startup?.catch(() => {});
        const results = await Promise.allSettled([reader, runtime.drain(), Promise.allSettled([...pendingRequests]), server ? new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) : Promise.resolve()]);
        signal?.removeEventListener('abort', onAbort);
        if (results.some(result => result.status === 'rejected')) throw Error('HTTP integration cleanup failed');
      })();
      return closing;
    },
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  return application;
}
module.exports = { createHttpApplication, BASE, ORIGIN };
