'use strict';
// Inert import: no driver, dotenv, models or service loads until validated execution.
const assert = require('node:assert/strict');
const collections = Object.freeze(['usuarios', 'counters', 'webhookevents']);
const expected = Object.freeze([
  { label: 'Usuario.email', collection: 'usuarios', key: { email: 1 }, unique: true, sparse: false },
  { label: 'Usuario.stripeAccountId', collection: 'usuarios', key: { stripeAccountId: 1 }, unique: false, sparse: true },
  { label: 'Counter.key', collection: 'counters', key: { key: 1 }, unique: true, sparse: false },
  { label: 'WebhookEvent.provider_eventId', collection: 'webhookevents', key: { provider: 1, eventId: 1 }, unique: true, sparse: false },
].map(spec => Object.freeze({ ...spec, key: Object.freeze(spec.key) })));
const prefix = 'ALAIA_INDEX_INSPECTION_';
const keys = ['URI', 'PROJECT_ID', 'CLUSTER_NAME', 'HOST', 'DB', 'CONFIRM'];
function confirmation({ project, cluster, host, database }) {
  return [project, cluster, host, database, collections.join(',')].join('|');
}
function validateConfig(env) {
  try {
    for (const name of Object.keys(env)) {
      assert.ok(!name.startsWith('ALAIA_MONGO_TEST_') && !name.startsWith('MONGODB_LOG_'));
      if (name.startsWith(prefix)) assert.ok(keys.includes(name.slice(prefix.length)));
    }
    for (const name of ['NODE_OPTIONS', 'NODE_DEBUG', 'DEBUG']) assert.equal(env[name], undefined);
    for (const name of ['MONGO_URI', 'MONGODB_URI', 'MONGO_URL', 'MONGODB_URL', 'DATABASE_URL', 'STRIPE_SECRET_KEY', 'STRIPE_API_KEY', 'FIREBASE_SERVICE_ACCOUNT_JSON', 'FIREBASE_CONFIG', 'GOOGLE_APPLICATION_CREDENTIALS']) assert.ok(!env[name]);
    for (const name of keys) assert.ok(typeof env[prefix + name] === 'string' && env[prefix + name].length > 0);
    const config = {
      uri: env[prefix + 'URI'], project: env[prefix + 'PROJECT_ID'],
      cluster: env[prefix + 'CLUSTER_NAME'], host: env[prefix + 'HOST'], database: env[prefix + 'DB'],
    };
    assert.match(config.project, /^[a-f0-9]{24}$/);
    assert.match(config.cluster, /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
    assert.match(config.host, /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.mongodb\.net$/);
    assert.ok(!config.host.includes('..'));
    assert.match(config.database, /^[A-Za-z][A-Za-z0-9_-]{0,62}$/);
    assert.ok(!/^alaia_/i.test(config.database));
    assert.ok(!['admin', 'local', 'config', 'test'].includes(config.database.toLowerCase()));
    const uri = new URL(config.uri);
    assert.equal(uri.protocol, 'mongodb+srv:'); assert.equal(uri.hostname, config.host);
    assert.equal(uri.pathname, '/' + config.database); assert.equal(uri.port, ''); assert.equal(uri.hash, '');
    const username = decodeURIComponent(uri.username), password = decodeURIComponent(uri.password);
    assert.ok(username.length > 0 && password.length > 0);
    assert.ok(!/integration|[<>\s]/i.test(username)); assert.ok(!/[<>]/.test(password));
    const names = [...uri.searchParams.keys()]; assert.equal(new Set(names).size, names.length);
    for (const [name, value] of uri.searchParams) {
      if (name === 'authSource') assert.equal(value, 'admin');
      else if (name === 'tls') assert.equal(value, 'true');
      else if (name === 'appName') assert.match(value, /^[A-Za-z0-9_-]{1,64}$/);
      else throw Error();
    }
    assert.equal(env[prefix + 'CONFIRM'], confirmation(config));
    return Object.freeze(config);
  } catch { throw Error('Invalid metadata inspection configuration'); }
}
function stable(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map(item => JSON.parse(stable(item))));
  if (value && typeof value === 'object') return JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(stable(value[key]))])));
  return JSON.stringify(value);
}
function collation(value) { return !value || value.locale === 'simple' ? null : value; }
function compareIndexes(name, indexes, options = {}) {
  assert.ok(collections.includes(name) && Array.isArray(indexes));
  const rows = expected.filter(spec => spec.collection === name).map(spec => {
    const matches = indexes.filter(index => index && typeof index.key === 'object' && JSON.stringify(Object.entries(index.key)) === JSON.stringify(Object.entries(spec.key)));
    if (!matches.length) return { index: spec.label, status: 'missing', reasons: ['key_absent'] };
    if (matches.length !== 1) return { index: spec.label, status: 'ambiguous', reasons: ['multiple_same_key_patterns'] };
    const index = matches[0], reasons = [];
    for (const option of ['unique', 'sparse']) {
      if (index[option] !== undefined && typeof index[option] !== 'boolean') reasons.push('invalid_' + option);
      else if ((index[option] === true) !== spec[option]) reasons.push(option + '_differs');
    }
    if (index.partialFilterExpression !== undefined) reasons.push('unexpected_partial_filter');
    if (index.expireAfterSeconds !== undefined) reasons.push('unexpected_ttl');
    if (index.buildUUID !== undefined || index.ready === false) reasons.push('index_build_not_verified');
    if (stable(collation(index.collation)) !== stable(collation(options.collation))) reasons.push('collation_differs');
    if (index.hidden !== undefined && typeof index.hidden !== 'boolean') reasons.push('invalid_hidden');
    return { index: spec.label, status: reasons.length ? 'incompatible' : 'matching', reasons, hidden: index.hidden === true };
  });
  const primary = indexes.filter(index => index?.key && JSON.stringify(Object.entries(index.key)) === '[["_id",1]]');
  return { collection: name, status: 'inspected', rows, primaryIndexPresent: primary.length === 1, additionalIndexCount: indexes.filter(index => !primary.includes(index) && !expected.some(spec => spec.collection === name && index?.key && JSON.stringify(Object.entries(index.key)) === JSON.stringify(Object.entries(spec.key)))).length, inheritedCollation: Boolean(collation(options.collation)) };
}
// Capability facade: does not expose a client, Db, Collection or document APIs.
function metadataScope(client, config) {
  const db = client.db(config.database); assert.equal(db.databaseName, config.database);
  return Object.freeze({
    collections(options) { return db.listCollections({ name: { $in: [...collections] } }, { ...options, nameOnly: false }); },
    indexes(name, options) {
      assert.ok(collections.includes(name));
      return db.collection(name).listIndexes(options);
    },
  });
}
class MetadataCleanupError extends Error {}
async function readCursor(cursor, limit) {
  const records = [];
  try {
    for (;;) { const item = await cursor.next(); if (item === null) return records; records.push(item); assert.ok(records.length <= limit); }
  } finally {
    try { await cursor.close({ timeoutMS: 2000 }); }
    catch { throw new MetadataCleanupError('Metadata cursor cleanup failed'); }
  }
}
function result(state) {
  return {
    status: state.failed ? 'failed' : 'completed', stage: state.stage,
    report: state.report, cleanup: state.cleanup, interrupted: Boolean(state.interrupted),
    productionAuthorized: false, projectClusterAssociation: 'human_attestation_not_server_verified',
    documentContents: 'not_read', remoteTermination: 'not_verified', detailsSuppressed: true,
  };
}
async function main(env = process.env, dependencies = {}) {
  const state = { failed: false, stage: 'configuration', report: [], cleanup: 'not_started' };
  dependencies.onState?.(state);
  let client;
  const check = () => { if (dependencies.signal?.aborted) { state.interrupted = true; throw Error(); } };
  try {
    const config = validateConfig(env); check(); state.stage = 'driver';
    const driver = (dependencies.loadDriver || (() => { assert.equal(require('mongodb/package.json').version, '7.0.0'); return require('mongodb'); }))();
    check(); state.stage = 'connect';
    client = new driver.MongoClient(config.uri, { dbName: config.database, maxPoolSize: 1, minPoolSize: 0, maxConnecting: 1, serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, waitQueueTimeoutMS: 2000, socketTimeoutMS: 5000, timeoutMS: 3000, retryReads: false, retryWrites: false, readPreference: 'primary', tls: true, mongodbLogComponentSeverities: { default: 'off' } });
    client.on?.('error', () => { state.failed = true; state.stage = 'connection_error'; });
    await client.connect(); check();
    const scope = metadataScope(client, config), options = { timeoutMS: 3000, maxTimeMS: 3000 };
    state.stage = 'collection_metadata';
    const metadata = await readCursor(scope.collections(options), 3), seen = new Set();
    for (const item of metadata) { assert.ok(item && collections.includes(item.name) && !seen.has(item.name)); seen.add(item.name); }
    for (const name of collections) {
      check(); state.stage = 'index_metadata';
      const item = metadata.filter(entry => entry.name === name)[0];
      if (!item) { state.failed = true; state.report.push({ collection: name, status: 'missing_collection' }); continue; }
      if (item.type !== 'collection' || !item.options || typeof item.options !== 'object') { state.failed = true; state.report.push({ collection: name, status: 'not_verified' }); continue; }
      const indexes = await readCursor(scope.indexes(name, options), 256);
      const comparison = compareIndexes(name, indexes, item.options); state.report.push(comparison);
      if (!comparison.primaryIndexPresent || comparison.rows.some(row => row.status !== 'matching')) state.failed = true;
    }
    check(); if (!state.failed) state.stage = 'complete';
  } catch (error) { state.failed = true; if (error instanceof MetadataCleanupError) state.cleanupFailed = true; }
  finally {
    try { if (client) await client.close(); state.cleanup = state.cleanupFailed ? 'failed' : client ? 'local_work_settled' : 'not_needed'; }
    catch { state.failed = true; state.stage = 'cleanup'; state.cleanup = 'failed'; }
    if (dependencies.signal?.aborted) { state.failed = true; state.interrupted = true; }
  }
  return result(state);
}
if (require.main === module) {
  let progress; const interruption = new AbortController();
  const interrupt = () => { if (progress) progress.interrupted = true; interruption.abort(); };
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  // Watchdog is forced termination, not successful cleanup or remote cancellation.
  const watchdog = setTimeout(() => { console.error(JSON.stringify(result({ ...progress, failed: true, stage: 'watchdog', cleanup: 'pending_or_unknown', report: progress?.report || [] }))); process.exit(1); }, 45000);
  main(process.env, { signal: interruption.signal, onState: state => { progress = state; } }).then(report => {
    clearTimeout(watchdog); process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
    console.log(JSON.stringify(report)); if (report.status !== 'completed') process.exitCode = 1;
  }, () => { clearTimeout(watchdog); console.error(JSON.stringify({ status: 'failed', detailsSuppressed: true })); process.exitCode = 1; });
}
module.exports = { validateConfig, confirmation, compareIndexes, metadataScope, main, expected, collections };
