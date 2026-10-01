'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig } = require('../scripts/mongo-phase5b-integration');
const db = 'alaia_integration_' + 'a'.repeat(32);
const valid = { ALAIA_MONGO_TEST_DB: db, ALAIA_MONGO_TEST_CONFIRM: db, ALAIA_MONGO_TEST_URI: 'mongodb+srv://example.mongodb.net/?retryWrites=true&w=majority' };
test('dedicated test configuration accepted without connecting', () => assert.equal(validateConfig(valid).db, db));
test('production database rejected', () => assert.throws(() => validateConfig({ ...valid, ALAIA_MONGO_TEST_DB: 'backendmulti' })));
test('production URI path rejected despite test db override', () => assert.throws(() => validateConfig({ ...valid, ALAIA_MONGO_TEST_URI: 'mongodb+srv://example.mongodb.net/backendmulti' })));
test('MONGO_URI is never a fallback', () => assert.throws(() => validateConfig({ ...valid, ALAIA_MONGO_TEST_URI: '', MONGO_URI: valid.ALAIA_MONGO_TEST_URI })));
test('explicit confirmation required', () => assert.throws(() => validateConfig({ ...valid, ALAIA_MONGO_TEST_CONFIRM: '' })));
test('local host and TLS bypass rejected', () => {
 assert.throws(() => validateConfig({ ...valid, ALAIA_MONGO_TEST_URI: 'mongodb://localhost/' }));
 assert.throws(() => validateConfig({ ...valid, ALAIA_MONGO_TEST_URI: 'mongodb+srv://example.mongodb.net/?tls=false' }));
});
test('unapproved URI options rejected', () => assert.throws(() => validateConfig({ ...valid, ALAIA_MONGO_TEST_URI: 'mongodb+srv://example.mongodb.net/?tlsAllowInvalidCertificates=true' })));
