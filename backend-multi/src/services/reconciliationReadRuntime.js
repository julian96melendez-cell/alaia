'use strict';
const { fail } = require('./reconciliationContracts');
const { getReconciliationReadLimits } = require('../config/reconciliationReads');
const { performance } = require('node:perf_hooks');
function createReadBudget(limits, now = () => performance.now()) {
  const deadline = now() + limits.httpTimeoutMS;
  let stopped = false;
  const remainingTimeMS = () => {
    const remaining = deadline - now();
    if (stopped || remaining <= 0) throw fail('REVIEW_READ_TIMEOUT', 504);
    return Math.max(1, Math.floor(remaining));
  };
  return {
    stop() { stopped = true; },
    remainingTimeMS,
    maxTimeMS() {
      return Math.min(limits.mongoMaxTimeMS, remainingTimeMS());
    },
  };
}
function createReconciliationReadRuntime(limits = getReconciliationReadLimits()) {
  let operations = 0, activeHTTP = 0;
  return {
    stats: () => ({ operations, activeHTTP }),
    async run(req, res, operation) {
      // Check before admission, including when capacity is already saturated.
      if (req.aborted || res.destroyed || res.closed || res.writableEnded) throw fail('REVIEW_READ_TIMEOUT', 504);
      if (operations >= limits.maxConcurrent) throw fail('REVIEW_READ_BUSY', 503);
      const budget = createReadBudget(limits);
      operations++; activeHTTP++;
      let httpDone = false, timer;
      const finishHTTP = () => {
        if (httpDone) return;
        httpDone = true; activeHTTP--;
        clearTimeout(timer);
        if (!res.writableEnded) budget.stop();
        res.removeListener('finish', finishHTTP); res.removeListener('close', finishHTTP);
        req.removeListener('aborted', disconnectHTTP);
      };
      const disconnectHTTP = () => { budget.stop(); finishHTTP(); };
      res.once('finish', finishHTTP); res.once('close', finishHTTP);
      req.once('aborted', disconnectHTTP);
      timer = setTimeout(() => {
        budget.stop();
        if (!res.destroyed && !res.writableEnded && !res.headersSent) {
          res.status(504).json({ ok: false, code: 'REVIEW_READ_TIMEOUT', financialActionsAllowed: false });
        }
      }, limits.httpTimeoutMS);
      try {
        if (res.destroyed || res.closed || req.aborted || res.writableEnded) { budget.stop(); finishHTTP(); }
        budget.maxTimeMS();
        const result = await operation(budget);
        budget.maxTimeMS();
        return result;
      } finally {
        clearTimeout(timer);
        // A disconnected/timed-out HTTP request does NOT prove MongoDB stopped.
        // Retain this slot until the entire operation/session cleanup settles.
        operations--;
      }
    },
  };
}
module.exports = { createReadBudget, createReconciliationReadRuntime };
