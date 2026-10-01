"use strict";
// Operational runner only. Not imported by the API; never starts automatically.
function runtimeDependencies() {
  require("dotenv").config();
  require("../src/utils/safeLogging").installSafeLogging();
  const mongoose = require("mongoose");
  return {
    connect: require("../src/config/db"),
    disconnect: () => mongoose.disconnect(),
    expire: limit => require("../src/services/checkoutLifecycle").getLifecycle().expire(limit),
    log: (...args) => console.log(...args),
  };
}
async function run(dependencies) {
  const { connect, disconnect, expire, log } = dependencies || runtimeDependencies();
  try {
    await connect();
    const result = await expire(100);
    log("Expired checkout reservations inspected:", result.checked, "failed:", result.failed);
    if (result.failed > 0) throw new Error("Expiration batch partially failed");
    return result;
  } finally { await disconnect(); }
}
async function main(dependencies, processState = process, reportError = console.error) {
  try { return await run(dependencies); }
  catch {
    // Never expose driver/Stripe errors, URIs or credentials to scheduler logs.
    reportError("Expiration runner failed; retry safely and inspect reconciliation flags");
    processState.exitCode = 1;
  }
}
if (require.main === module) void main();
module.exports = { run, main };
