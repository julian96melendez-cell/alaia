require("dotenv").config();
require("./src/utils/safeLogging").installSafeLogging();

const conectarDB = require("./src/config/db");
const startWorkers = require("./src/hubs/workersHub");

(async () => {
  try {
    require("./src/config/financialOperations").assertFinancialOperationsEnabled();
    await conectarDB();
    startWorkers();
    console.log("✅ WORKERS RUNNING");
  } catch (e) {
    console.error("FATAL WORKERS:", e?.message || e);
    process.exit(1);
  }
})();