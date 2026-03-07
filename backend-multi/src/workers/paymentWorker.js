const { Worker } = require("bullmq");
const { connection } = require("../services/queue");
const Orden = require("../models/Orden");
const { enviarCorreoOrdenPagada } = require("../services/emailService");

const worker = new Worker(
  "payments",
  async job => {
    if (job.name === "pago-confirmado") {
      const { ordenId } = job.data;

      const orden = await Orden.findById(ordenId)
        .populate("usuario", "email nombre")
        .lean();

      if (!orden) return;

      const email = orden.usuario?.email;
      if (!email) return;

      await enviarCorreoOrdenPagada({
        to: email,
        orden,
      });

      console.log("📧 Email enviado", ordenId);
    }
  },
  { connection }
);

worker.on("failed", (job, err) => {
  console.error("Worker failed:", err);
});

console.log("🧠 Payment worker running");