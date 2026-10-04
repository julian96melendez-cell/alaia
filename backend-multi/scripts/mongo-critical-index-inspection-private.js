'use strict';
// Inert import. Credential input is stdin only; never argv or process.env.
const inspector = require('./mongo-critical-index-inspector');
const names = ['PROJECT_ID', 'CLUSTER_NAME', 'HOST', 'DB', 'CONFIRM'];
const prefix = 'ALAIA_INDEX_INSPECTION_';
function prepare(password, env) {
  for (const key of Object.keys(env)) {
    if (!['PATH', '__CF_USER_TEXT_ENCODING'].includes(key) && !names.some(name => key === prefix + name)) throw Error();
  }
  if (typeof password !== 'string' || !password || Buffer.byteLength(password) > 4096 || /[\r\n\0]/.test(password)) throw Error();
  if (env[prefix + 'PROJECT_ID'] !== '6934caf0d4e66132196bd495' || env[prefix + 'CLUSTER_NAME'] !== 'Cluster0' || env[prefix + 'DB'] !== 'backendmulti') throw Error();
  const config = Object.fromEntries(names.map(name => [prefix + name, env[prefix + name]]));
  config[prefix + 'URI'] = 'mongodb+srv://alaia_index_inspector:' + encodeURIComponent(password) + '@' + config[prefix + 'HOST'] + '/backendmulti?authSource=admin&tls=true&appName=AlaiaIndexInspection';
  inspector.validateConfig(config);
  return config;
}
async function readPassword(input) {
  const chunks = []; let size = 0;
  try {
    for await (const chunk of input) {
      const bytes = Buffer.from(chunk); chunks.push(bytes); size += bytes.length;
      if (size > 4096) throw Error();
    }
    const bytes = Buffer.concat(chunks);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    finally { bytes.fill(0); }
  } finally { chunks.forEach(chunk => chunk.fill(0)); }
}
async function run({ input, env, mode, stdout, stderr, signal, main = inspector.main }) {
  let config;
  try {
    if (!['--validate', '--inspect'].includes(mode)) throw Error();
    config = prepare(await readPassword(input), env);
    if (signal?.aborted) throw Error();
  } catch {
    stderr.write('{"status":"failed","stage":"preparation","failureCode":"configuration_invalid","detailsSuppressed":true}\n');
    return 1;
  }
  try {
    if (mode === '--validate') {
      stdout.write('Preparación y validación local: OK. Sin conexión.\n'); return 0;
    }
    const report = await main(config, { signal });
    stdout.write(JSON.stringify(report) + '\n');
    return report.status === 'completed' ? 0 : 1;
  } catch {
    stderr.write('{"status":"failed","stage":"execution","failureCode":"unknown","detailsSuppressed":true}\n'); return 1;
  } finally { delete config[prefix + 'URI']; }
}
if (require.main === module) {
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  const watchdog = setTimeout(() => {
    console.error('{"status":"failed","stage":"watchdog","cleanup":"pending_or_unknown","remoteTermination":"not_verified","detailsSuppressed":true}');
    process.exit(1);
  }, 45000);
  run({ input: process.stdin, env: process.env, mode: process.argv.length === 3 ? process.argv[2] : '', stdout: process.stdout, stderr: process.stderr, signal: controller.signal }).then(code => {
    clearTimeout(watchdog); process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); process.exitCode = code;
  }, () => { clearTimeout(watchdog); console.error('{"status":"failed","detailsSuppressed":true}'); process.exitCode = 1; });
}
module.exports = { prepare, readPassword, run };
