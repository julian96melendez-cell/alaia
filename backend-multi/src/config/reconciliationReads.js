'use strict';
function getReconciliationReadLimits(env = process.env) {
  const integer = (name, fallback, min, max) => {
    if (env[name] === undefined) return fallback;
    if (!/^[1-9][0-9]*$/.test(env[name]) || Number(env[name]) < min || Number(env[name]) > max) {
      throw new Error('Invalid reconciliation read configuration');
    }
    return Number(env[name]);
  };
  return Object.freeze({
    mongoMaxTimeMS: integer('ALAIA_RECONCILIATION_MONGO_MAX_TIME_MS', 2000, 100, 10000),
    httpTimeoutMS: integer('ALAIA_RECONCILIATION_READ_TIMEOUT_MS', 8000, 500, 15000),
    maxConcurrent: integer('ALAIA_RECONCILIATION_MAX_CONCURRENT_READS', 4, 1, 16),
  });
}
module.exports = { getReconciliationReadLimits };
