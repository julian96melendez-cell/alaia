"use strict";
// Operational runner only. Not imported by the API; never starts automatically.
async function run() {
  require("dotenv").config();
  require("../src/utils/safeLogging").installSafeLogging();
  const mongoose = require("mongoose");
  try {
    await require("../src/config/db")();
    const result = await require("../src/services/checkoutLifecycle").getLifecycle().expire(100);
    console.log("Expired checkout reservations inspected:", result.checked, "failed:", result.failed);
  } finally { await mongoose.disconnect(); }
}
if (require.main === module) run().catch(() => { console.error("Expiration runner failed; retry safely and inspect reconciliation flags"); process.exitCode = 1; });
module.exports = { run };
