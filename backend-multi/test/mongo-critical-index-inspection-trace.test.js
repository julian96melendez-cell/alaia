'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const trace = require('../scripts/mongo-critical-index-inspection-trace');
const script = path.resolve(__dirname, '../scripts/mongo-critical-index-inspection-trace.js');
const secret = 'SYNTHETIC_SECRET_TRACE_SENTINEL';
function remove(dir) { fs.rmSync(dir, { recursive: true, force: true }); }
test('prepare and finish capture private fixed-file hashes and runtime without secrets or network imports', () => {
  const guard = `const Module=require('node:module'),load=Module._load;Module._load=function(name,...args){if(/^(mongodb|mongoose|dotenv|stripe|firebase-admin)(\\/|$)/.test(name)||/mongo-critical-index-inspector$/.test(name))throw Error('Forbidden');return load.call(this,name,...args);};require('node:net').Socket.prototype.connect=()=>{throw Error('Forbidden network');};const trace=require(${JSON.stringify(script)});const dir=trace.prepareTrace();if(!trace.finishTrace(dir))throw Error('Changed');process.stdout.write(dir);`;
  const child = spawnSync(process.execPath, ['-e', guard], { env: { PATH: process.env.PATH, SYNTHETIC_SECRET: secret }, encoding: 'utf8', timeout: 10000 });
  assert.equal(child.error, undefined); assert.equal(child.status, 0); assert.equal(child.stderr, '');
  const dir = child.stdout;
  try {
    assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
    for (const name of fs.readdirSync(dir)) {
      assert.equal(fs.statSync(path.join(dir,name)).mode & 0o777, 0o600);
      assert.doesNotMatch(fs.readFileSync(path.join(dir,name),'utf8'), /SYNTHETIC_SECRET_TRACE_SENTINEL|mongodb(?:\+srv)?:\/\//);
    }
    const before=JSON.parse(fs.readFileSync(path.join(dir,'sha256-before.json')));
    assert.deepEqual(before,JSON.parse(fs.readFileSync(path.join(dir,'sha256-after.json'))));
    assert.equal(before.files.length,trace.files.length);assert.ok(before.files.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));
    const runtime=JSON.parse(fs.readFileSync(path.join(dir,'runtime-before.json')));
    assert.equal(runtime.mongodbVersion,'7.0.0');assert.equal(runtime.nodeVersion,process.version);assert.ok(path.isAbsolute(runtime.nodePath));
  } finally { remove(dir); }
});
test('changed synthetic manifest is detected and existing records are never overwritten', () => {
  const dir=trace.prepareTrace();
  try {
    const modified=trace.manifest();modified.files[0].sha256='0'.repeat(64);
    assert.equal(trace.finishTrace(dir,{manifest:()=>modified}),false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'trace-summary.json'))).status,'changed');
    const before=fs.readFileSync(path.join(dir,'sha256-after.json'),'utf8');
    assert.throws(()=>trace.finishTrace(dir));
    assert.equal(fs.readFileSync(path.join(dir,'sha256-after.json'),'utf8'),before);
  } finally { remove(dir); }
});
test('manifest rejects missing files and symlinked sources', () => {
  const base=fs.mkdtempSync('/private/tmp/alaia-trace-fixture.');
  try {
    for(const file of trace.files){fs.mkdirSync(path.dirname(path.join(base,file)),{recursive:true});fs.writeFileSync(path.join(base,file),'synthetic');}
    assert.equal(trace.manifest(base).files.length,trace.files.length);
    fs.unlinkSync(path.join(base,trace.files[0]));assert.throws(()=>trace.manifest(base));
    fs.symlinkSync(path.join(base,trace.files[1]),path.join(base,trace.files[0]));assert.throws(()=>trace.manifest(base));
  } finally { remove(base); }
});
test('invalid modes, insecure directory and symlinked result files fail generically without credential output', () => {
  const child=spawnSync(process.execPath,[script,'--inspect'],{env:{PATH:process.env.PATH,SYNTHETIC_SECRET:secret},encoding:'utf8',timeout:5000});
  assert.equal(child.status,1);assert.equal(child.stdout,'');assert.equal(child.stderr,'Trazabilidad local: FALLO; detalles ocultos.\n');
  const dir=trace.prepareTrace();
  try {
    fs.chmodSync(dir,0o755);assert.throws(()=>trace.finishTrace(dir));fs.chmodSync(dir,0o700);
    fs.unlinkSync(path.join(dir,'sha256-before.json'));fs.symlinkSync(path.join(dir,'runtime-before.json'),path.join(dir,'sha256-before.json'));
    assert.throws(()=>trace.finishTrace(dir));
  } finally { remove(dir); }
});
test('source has no inspector execution, driver load, environment dump or repository-content export', () => {
  const source=fs.readFileSync(script,'utf8');
  assert.doesNotMatch(source,/require\(['"](?:mongodb|mongoose|dotenv|.*mongo-critical-index-inspector)/);
  assert.doesNotMatch(source,/\.connect\(|process\.env\.(?:MONGO|ALAIA)|JSON\.stringify\(process\.env/);
  assert.ok(trace.files.includes('backend-multi/scripts/mongo-critical-index-inspection-trace.js'));
  assert.ok(trace.files.includes('backend-multi/package-lock.json'));
});
