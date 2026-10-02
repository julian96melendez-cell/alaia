'use strict';
const assert = require('node:assert/strict'), Module = require('node:module');
const net = require('node:net'), dns = require('node:dns');
const fs = require('node:fs'), childProcess = require('node:child_process');
const path = require('node:path');
const fixtureRoot = path.resolve(__dirname, '..');
let references = 0, restore, violations = [];
const ports = new Set();
function acquireSandboxGuard() {
  const firstViolation = violations.length;
  if (references++ === 0) {
    const load = Module._load, connect = net.Socket.prototype.connect, listen = net.Server.prototype.listen;
    const lookups = [], guardedCalls = [];
    const denied = kind => { violations.push(kind); throw Error('Forbidden sandbox infrastructure action'); };
    Module._load = function (name, ...args) {
      if (/(?:^|[\\/])(?:stripe|firebase|firebase-admin|dotenv)(?:[\\/]|$)/.test(name) || /(?:^|[\\/])(?:workers|scheduler)(?:\.|[\\/]|$)/.test(name)) return denied('service import');
      return load.call(this, name, ...args);
    };
    net.Socket.prototype.connect = function (...args) {
      const normalized = Array.isArray(args[0]) ? args[0] : args;
      const options = typeof normalized[0] === 'object' ? normalized[0] : { port: normalized[0], host: normalized[1] };
      if (!options || options.path || (options.host || options.hostname) !== '127.0.0.1' || !ports.has(Number(options.port))) return denied('non-fixture socket');
      return connect.apply(this, args);
    };
    net.Server.prototype.listen = function (...args) {
      const options = typeof args[0] === 'object' ? args[0] : { port: args[0], host: args[1] };
      if (options.port !== 0 || options.host !== '127.0.0.1') return denied('non-loopback listener');
      return listen.apply(this, args);
    };
    for (const object of [dns, dns.promises]) for (const name of Object.keys(object).filter(key => key.startsWith('resolve') || key === 'lookup' || key === 'lookupService')) {
      if (typeof object[name] !== 'function') continue;
      const original = object[name]; lookups.push([object, name, original]);
      object[name] = function (host, ...args) {
        if (name !== 'lookup' || host !== '127.0.0.1') return denied('external DNS');
        return original.call(this, host, ...args);
      };
    }
    const sensitivePath = value => {
      const file = value instanceof URL ? value.pathname : Buffer.isBuffer(value) ? value.toString() : String(value);
      const resolved = path.resolve(file);
      return !resolved.startsWith(fixtureRoot + path.sep) || /(?:^|[\\/])(?:\.env(?:\.[^\\/]*)?|\.aws|\.ssh|\.config|credentials(?:\.[^\\/]*)?|[^\\/]*service[-_]?account[^\\/]*)(?:[\\/]|$)/i.test(file);
    };
    for (const object of [fs, fs.promises]) for (const name of ['readFile', 'readFileSync', 'open', 'openSync']) {
      if (typeof object[name] !== 'function') continue;
      const original = object[name]; guardedCalls.push([object, name, original]);
      object[name] = function (file, ...args) {
        if (sensitivePath(file)) return denied('credential file');
        return original.call(this, file, ...args);
      };
    }
    for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
      guardedCalls.push([childProcess, name, childProcess[name]]);
      childProcess[name] = () => denied('child process');
    }
    restore = () => {
      Module._load = load; net.Socket.prototype.connect = connect; net.Server.prototype.listen = listen;
      for (const [object, name, original] of lookups) object[name] = original;
      for (const [object, name, original] of guardedCalls) object[name] = original;
      ports.clear();
    };
  }
  let released = false;
  return {
    allow(server) {
      let port;
      const register = () => { const address = server.address(); if (address) { port = address.port; ports.add(port); } };
      register(); server.once('listening', register);
      server.once('close', () => ports.delete(port));
    },
    release(expectedViolations = []) {
      if (released) return; released = true;
      if (--references === 0) restore();
      assert.deepEqual(violations.slice(firstViolation), expectedViolations, 'Sandbox infrastructure guard was triggered');
    }
  };
}
module.exports = { acquireSandboxGuard };
