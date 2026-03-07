const { Worker } = require("bullmq");
const { getRedisConnection } = require("../queues/redis");
const Orden = require("../models/Orden");

let EmailService = null;
try {
  EmailService = require("../services/emailService");
} catch (_) {
  EmailService = null;
}

const connection = getRedisConnection();

function startEmailWorker() {
  const concurrency = Number(process.env.QUEUE_EMAIL_CONCURRENCY || 5);

  const worker = new Worker(
    "email-queue",
    async (job) => {
      const { name, data } = job;

      if (!EmailService) throw new Error("EmailService missing");

      if (name === "order.paid") {
        const orden = await Orden.findById(data.ordenId).lean();
        if (!orden) return;

        await EmailService.enviarCorreoOrdenPagada({
          to: data.to,
          orden,
        });

        return { sent: true };
      }

      if (name === "order.fulfillment.changed") {
        const orden = await Orden.findById(data.ordenId).lean();
        if (!orden) return;

        await EmailService.enviarCorreoCambioEstado({
          to: data.to,
          orden,
          nuevoEstado: data.nuevoEstado,
        });

        return { sent: true };
      }

      return { ignored: true };
    },
    { connection, concurrency }
  );

  worker.on("completed", (job) => {
    console.log(`✅ Email job done: ${job.name} (${job.id})`);
  });

  worker.on("failed", (job, err) => {
    console.log(`❌ Email job failed: ${job?.name} (${job?.id}) → ${err?.message}`);
  });

  console.log(`📨 Email Worker ready (concurrency=${concurrency})`);
  return worker;
}

module.exports = { startEmailWorker };