require("dotenv").config();

const conectarDB = require("./src/config/db");
const startWorkers = require("./src/hubs/workersHub");

(async () => {
  try {
    await conectarDB();
    startWorkers();
    console.log("✅ WORKERS RUNNING");
  } catch (e) {
    console.error("FATAL WORKERS:", e?.message || e);
    process.exit(1);
  }
})();