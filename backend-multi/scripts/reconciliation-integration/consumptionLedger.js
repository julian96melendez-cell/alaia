'use strict';
// No implicit initialization: provisioning this nonsecret ledger is a separate step.
const fs = require('node:fs'), path = require('node:path');
const historical = Object.freeze([
  'alaia_integration_ef588efb1b388be659120f9c1b6254cc',
  'alaia_78943cf524ef883d31e9628163931fe8',
  'alaia_ba98fd0d1a69e51e79c3bd384d23916c',
  'alaia_faf7a4d2651ecd5fb67539a6eb5889ad',
  'alaia_2754d1782faf11ea3681d2eeed70bc47',
]);
const invalid = () => new Error('Invalid or unavailable consumption ledger');
function privateEntry(stat, mode, directory = false) {
  if (stat.uid !== process.getuid() || (stat.mode & 0o777) !== mode || (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)) throw invalid();
}
function acquireLedger(file) {
  let locked = false, closed = false, fd, directoryFd, lockIdentity;
  const directory = path.dirname(file), lock = file + '.lock';
  if (!path.isAbsolute(file) || path.basename(file) !== 'consumed-databases.json') throw invalid();
  for (let current = directory; current !== path.dirname(current); current = path.dirname(current)) {
    if (fs.lstatSync(current).isSymbolicLink()) throw invalid();
  }
  const directoryIdentity = fs.lstatSync(directory); privateEntry(directoryIdentity, 0o700, true);
  const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
  const syncDirectory = () => fs.fsyncSync(directoryFd);
  let identity;
  const checkIdentity = () => {
    const parent = fs.lstatSync(directory), entry = fs.lstatSync(file), mutex = fs.lstatSync(lock);
    privateEntry(parent, 0o700, true); privateEntry(entry, 0o600); privateEntry(mutex, 0o700, true);
    if (!same(parent, directoryIdentity) || !same(entry, identity) || !same(mutex, lockIdentity)) throw invalid();
    privateEntry(fs.fstatSync(fd), 0o600);
  };
  const read = () => {
    checkIdentity(); const stat = fs.fstatSync(fd);
    if (stat.size > 1024 * 1024) throw invalid();
    const buffer = Buffer.alloc(stat.size); let offset = 0;
    while (offset < buffer.length) {
      const count = fs.readSync(fd, buffer, offset, buffer.length - offset, offset);
      if (count <= 0) throw invalid(); offset += count;
    }
    const text = buffer.toString('utf8'), record = JSON.parse(text);
    if (record.version !== 1 || !Array.isArray(record.consumed) || Object.keys(record).sort().join() !== 'consumed,version') throw invalid();
    const seen = new Set();
    for (const entry of record.consumed) {
      if (typeof entry !== 'string' || (!/^alaia_[a-f0-9]{32}$/.test(entry) && !historical.includes(entry)) || seen.has(entry)) throw invalid();
      seen.add(entry);
    }
    if (!historical.every(name => seen.has(name))) throw invalid();
    return { record, text };
  };
  const closeDescriptors = () => {
    try { if (fd !== undefined) fs.closeSync(fd); } finally { if (directoryFd !== undefined) fs.closeSync(directoryFd); }
    fd = directoryFd = undefined;
  };
  try {
    directoryFd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    if (!same(fs.fstatSync(directoryFd), directoryIdentity)) throw invalid();
    fs.mkdirSync(lock, { mode: 0o700 }); locked = true; lockIdentity = fs.lstatSync(lock); syncDirectory();
    fd = fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW);
    identity = fs.fstatSync(fd); privateEntry(identity, 0o600);
    let current = read();
    return {
      assertUnused(database) {
        if (closed || !/^alaia_[a-f0-9]{32}$/.test(database)) throw invalid();
        const latest = read(); if (latest.text !== current.text || latest.record.consumed.includes(database)) throw invalid();
      },
      consume(database) {
        this.assertUnused(database);
        const record = { version: 1, consumed: [...current.record.consumed, database] };
        const data = Buffer.from(JSON.stringify(record)); let written = 0;
        while (written < data.length) {
          const count = fs.writeSync(fd, data, written, data.length - written, written);
          if (count <= 0) throw invalid(); written += count;
        }
        fs.ftruncateSync(fd, data.length); fs.fsyncSync(fd); syncDirectory();
        const latest = read(); if (latest.text !== data.toString('utf8')) throw invalid();
        current = latest;
      },
      close() {
        if (closed) return; closed = true;
        try {
          const entry = fs.lstatSync(lock);
          if (!same(entry, lockIdentity) || !entry.isDirectory()) throw invalid();
          fs.rmdirSync(lock); locked = false; syncDirectory();
        } finally { closeDescriptors(); }
      },
    };
  } catch {
    try { if (locked && same(fs.lstatSync(lock), lockIdentity)) { fs.rmdirSync(lock); syncDirectory(); } } catch { /* Retain uncertain mutex. */ }
    try { closeDescriptors(); } catch { /* Admission already failed. */ }
    throw invalid();
  }
}
module.exports = { acquireLedger, historical };
