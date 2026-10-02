'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('Usuario retains one unique email index and one sparse Stripe index without duplicate warnings', () => {
  // Fresh compilation exposes warnings that the module cache could otherwise hide.
  // Both connection APIs and sockets are forbidden; no model.init or index command.
  const result = spawnSync(process.execPath, ['-e', `
    require('node:net').Socket.prototype.connect = () => { throw Error('Forbidden network'); };
    const mongoose = require('mongoose');
    mongoose.connect = mongoose.createConnection = () => { throw Error('Forbidden connection'); };
    mongoose.set('autoCreate', false); mongoose.set('autoIndex', false);
    const Usuario = require('./src/models/Usuario');
    const indexes = Usuario.schema.indexes();
    const select = key => indexes.filter(([fields]) =>
      JSON.stringify(fields) === JSON.stringify({ [key]: 1 }));
    if (mongoose.connection.readyState !== 0) throw Error('Unexpected connection');
    process.stdout.write(JSON.stringify({
      email: select('email'), stripe: select('stripeAccountId'),
      emailFieldIndexed: Boolean(Usuario.schema.path('email').options.index),
      stripeFieldIndexed: Usuario.schema.path('stripeAccountId').options.index,
      stripeFieldSparse: Usuario.schema.path('stripeAccountId').options.sparse,
    }));
  `], { cwd: path.join(__dirname, '..'), env: {}, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  const definitions = JSON.parse(result.stdout);
  assert.deepEqual(definitions.email, [[{ email: 1 }, { unique: true }]]);
  assert.deepEqual(definitions.stripe, [[{ stripeAccountId: 1 }, { sparse: true }]]);
  assert.equal(definitions.emailFieldIndexed, false);
  assert.equal(definitions.stripeFieldIndexed, true);
  assert.equal(definitions.stripeFieldSparse, true);
  assert.doesNotMatch(result.stderr, /Duplicate schema index on \{"(?:email|stripeAccountId)":1\}/);
});
