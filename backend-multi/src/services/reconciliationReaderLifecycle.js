"use strict";
const { getNativeReaderConfig } = require("../config/reconciliationNativeReader");
// Import is inert. One coordinator owns at most one reader for its process.
function createReconciliationReaderLifecycle({ env = process.env, createReader = options => require("./reconciliationNativeReader").createNativeReconciliationReader(options) } = {}) {
  env = Object.freeze({ ...env });
  const config = getNativeReaderConfig(env);
  let reader, initialization, shutdown, stopped = false, initialized = false;
  return Object.freeze({
    enabled: config.enabled,
    initialize(connection) {
      if (stopped) return Promise.reject(new Error("Reconciliation reader unavailable"));
      if (!initialization) initialization = (async () => {
        if (config.enabled) {
          reader = createReader({ env });
          await reader.connect(connection);
          if (stopped) throw new Error("Reconciliation reader unavailable");
        }
        initialized = true;
      })();
      return initialization;
    },
    handlers() {
      if (!initialized || stopped) throw new Error("Reconciliation reader unavailable");
      return reader?.handlers;
    },
    close() {
      if (shutdown) return shutdown;
      stopped = true;
      // close() immediately closes admission, then awaits initialization/work.
      let closing;
      try { closing = Promise.resolve(reader ? reader.close() : undefined); }
      catch { closing = Promise.reject(new Error("Reconciliation reader cleanup failed")); }
      const drain = closing.then(() => ({ ok: true }), () => ({ ok: false }));
      shutdown = (async () => {
        await initialization?.catch(() => {});
        if (!(await drain).ok) throw new Error("Reconciliation reader cleanup failed");
      })();
      return shutdown;
    },
  });
}
module.exports = { createReconciliationReaderLifecycle };
