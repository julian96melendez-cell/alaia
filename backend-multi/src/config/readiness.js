"use strict";
function createReadinessHandler(connection) {
  return (_req, res) => {
    const ready = connection.readyState === 1;
    res.status(ready ? 200 : 503).json({
      ok: ready,
      status: ready ? "ready" : "not_ready",
      timestamp: new Date().toISOString(),
    });
  };
}
module.exports = { createReadinessHandler };
