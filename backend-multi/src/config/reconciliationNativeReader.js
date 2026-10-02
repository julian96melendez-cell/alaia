'use strict';
const { getReconciliationReadLimits } = require('./reconciliationReads');
function getNativeReaderConfig(env = process.env) {
  const flag = env.ALAIA_RECONCILIATION_NATIVE_READER_ENABLED;
  if (flag === undefined || flag === 'false') return Object.freeze({ enabled: false });
  if (flag !== 'true') throw new Error('Invalid native reconciliation reader configuration');
  const integer = (suffix, fallback, min, max) => {
    const value = env['ALAIA_RECONCILIATION_NATIVE_' + suffix];
    if (value === undefined) return fallback;
    if (!/^[1-9][0-9]*$/.test(value) || Number(value) < min || Number(value) > max) throw new Error('Invalid native reconciliation reader configuration');
    return Number(value);
  };
  const config = {
    enabled: true,
    ...getReconciliationReadLimits(env),
    serverSelectionTimeoutMS: integer('SERVER_SELECTION_TIMEOUT_MS', 1000, 100, 5000),
    connectTimeoutMS: integer('CONNECT_TIMEOUT_MS', 2000, 100, 5000),
    waitQueueTimeoutMS: integer('WAIT_QUEUE_TIMEOUT_MS', 1000, 100, 5000),
    socketTimeoutMS: integer('SOCKET_TIMEOUT_MS', 3000, 100, 10000),
    cleanupTimeoutMS: integer('CLEANUP_TIMEOUT_MS', 2000, 100, 5000),
    maxPoolSize: integer('MAX_POOL_SIZE', 6, 2, 20),
  };
  if (config.maxPoolSize < config.maxConcurrent + 1) throw new Error('Invalid native reconciliation reader configuration');
  return Object.freeze(config);
}
module.exports = { getNativeReaderConfig };
