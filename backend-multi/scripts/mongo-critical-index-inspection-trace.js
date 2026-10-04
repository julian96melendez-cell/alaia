'use strict';
// Local metadata only. No inspector/driver import and no remote execution mode.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const files = Object.freeze([
  'backend-multi/scripts/mongo-critical-index-inspector.js',
  'backend-multi/scripts/mongo-critical-index-inspection-private.js',
  'backend-multi/scripts/mongo-critical-index-inspection-private.sh',
  'backend-multi/scripts/mongo-critical-index-inspection-trace.js',
  'backend-multi/test/mongo-critical-index-inspector.test.js',
  'backend-multi/test/mongo-critical-index-inspection-private.test.js',
  'backend-multi/test/mongo-critical-index-inspection-trace.test.js',
  'docs/mongo-critical-index-inspection.md',
  'backend-multi/package-lock.json',
]);
function readRegular(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { if (!fs.fstatSync(fd).isFile()) throw Error(); return fs.readFileSync(fd); }
  finally { fs.closeSync(fd); }
}
function manifest(base = root) {
  return { algorithm: 'SHA-256', files: files.map(file => ({ file, sha256: crypto.createHash('sha256').update(readRegular(path.join(base, file))).digest('hex') })) };
}
function gitState(base = root) {
  const git = args => execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', ...args], { cwd: base, env: { PATH: process.env.PATH }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const head = git(['rev-parse', 'HEAD']).trim(), branch = git(['branch', '--show-current']).trim();
  if (!/^[a-f0-9]{40}$/.test(head) || branch !== 'fix/production-hardening') throw Error();
  const raw = git(['status', '--porcelain=v1', '-z', '--untracked-files=all']).split('\0');
  const entries = []; let otherPendingCount = 0;
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i]; if (!row) continue;
    const status = row.slice(0, 2), file = row.slice(3);
    if (!/^[ MADRCU?!]{2}$/.test(status) || row[2] !== ' ') throw Error();
    if (files.includes(file)) entries.push({ file, status }); else otherPendingCount++;
    if (/[RC]/.test(status)) i++; // do not expose a rename's arbitrary previous name
  }
  return { head, branch, clean: entries.length === 0 && otherPendingCount === 0, entries, otherPendingCount };
}
function runtime() {
  const driverPackage = path.join(root, 'backend-multi/node_modules/mongodb/package.json');
  const version = JSON.parse(readRegular(driverPackage)).version;
  if (version !== '7.0.0') throw Error();
  return { nodeVersion: process.version, nodePath: fs.realpathSync(process.execPath), mongodbVersion: version, driverPackageSHA256: crypto.createHash('sha256').update(readRegular(driverPackage)).digest('hex') };
}
function writePrivate(dir, name, value) {
  const fd = fs.openSync(path.join(dir, name), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.fchmodSync(fd, 0o600); fs.writeFileSync(fd, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}
function verifyDir(dir) {
  if (path.dirname(dir) !== '/private/tmp' || !/^alaia-index-result\.[A-Za-z0-9]+$/.test(path.basename(dir))) throw Error();
  const info = fs.lstatSync(dir);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o700) throw Error();
}
function prepareTrace() {
  const before = manifest(), state = gitState(), versions = runtime();
  const dir = fs.mkdtempSync('/private/tmp/alaia-index-result.'); fs.chmodSync(dir, 0o700);
  writePrivate(dir, 'head.txt', state.head + '\n');
  writePrivate(dir, 'git-before.json', state);
  writePrivate(dir, 'runtime-before.json', versions);
  writePrivate(dir, 'sha256-before.json', before);
  return dir;
}
function finishTrace(dir, dependencies = {}) {
  verifyDir(dir);
  const before = JSON.parse(readRegular(path.join(dir, 'sha256-before.json')));
  const runtimeBefore = JSON.parse(readRegular(path.join(dir, 'runtime-before.json')));
  const after = (dependencies.manifest || manifest)(), versions = (dependencies.runtime || runtime)(), state = (dependencies.gitState || gitState)();
  writePrivate(dir, 'sha256-after.json', after);
  writePrivate(dir, 'runtime-after.json', versions);
  writePrivate(dir, 'git-after.json', state);
  const unchanged = JSON.stringify(before) === JSON.stringify(after) && JSON.stringify(runtimeBefore) === JSON.stringify(versions);
  const summary = { status: unchanged ? 'unchanged' : 'changed', capturedAt: new Date().toISOString(), dependencyTreeCertified: false, transientChangesExcluded: false };
  writePrivate(dir, 'trace-summary.json', summary);
  return unchanged;
}
if (require.main === module) {
  try {
    if (process.argv.length === 3 && process.argv[2] === '--prepare') process.stdout.write(prepareTrace() + '\n');
    else if (process.argv.length === 4 && process.argv[2] === '--finish') {
      const unchanged = finishTrace(process.argv[3]); process.stdout.write(unchanged ? 'Trazabilidad: sin cambios.\n' : 'Trazabilidad: cambios detectados.\n');
      if (!unchanged) process.exitCode = 1;
    } else throw Error();
  } catch { process.stderr.write('Trazabilidad local: FALLO; detalles ocultos.\n'); process.exitCode = 1; }
}
module.exports = { files, manifest, gitState, runtime, prepareTrace, finishTrace };
