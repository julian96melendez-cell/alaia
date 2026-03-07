const { Worker } = require("bullmq");
const { connection } = require("./eventBus");

const Orden = require("../models/Orden");

let EmailService = null;
try {
  EmailService = require("../services/emailService");
} catch (_) {
  EmailService = null;
}

function envBool(key, def = false) {
  const v = process.env[key];
  if (v === undefined || v === null || String(v).trim() === "") return def;
  return ["1", "true", "yes", "y", "on"].includes(String(v).trim().toLowerCase());
}

const FLAGS = {
  EMAILS_ENABLED: envBool("EMAILS_ENABLED", true),
};

function extractEmail(orden) {
  const usuarioObj =
    orden?.usuario && typeof orden.usuario === "object" ? orden.usuario : null;

  return (
    usuarioObj?.email ||
    orden?.email ||
    orden?.clienteEmail ||
    orden?.direccionEntrega?.email ||
    null
  );
}

// Ledger idempotente (no duplicar emails)
function ledgerKey(kind, value) {
  return `email_${kind}_${String(value || "").toLowerCase()}`.slice(0, 120);
}
function hasLedger(orden, key) {
  const h = Array.isArray(orden?.historial) ? orden.historial : [];
  return h.some((x) => x?.estado === key);
}
function pushLedger(orden, key, meta) {
  if (!Array.isArray(orden.historial)) orden.historial = [];
  orden.historial.push({ estado: key, fecha: new Date(), meta: meta || null });
}

const worker = new Worker(
  "events",
  async (job) => {
    const { name, payload } = job.data || {};
    if (!name) return;

    // =========================
    // EVENT: ORDER_PAID
    // =========================
    if (name === "ORDER_PAID") {
      if (!FLAGS.EMAILS_ENABLED) return;

      const { ordenId, reason } = payload || {};
      if (!ordenId) return;

      const orden = await Orden.findById(ordenId).populate("usuario", "email nombre");
      if (!orden) return;

      const to = extractEmail(orden);
      if (!to || !EmailService?.enviarCorreoOrdenPagada) return;

      const key = ledgerKey("payment", "pagado");
      if (hasLedger(orden, key)) return;

      await EmailService.enviarCorreoOrdenPagada({ to, orden });
      pushLedger(orden, key, { reason, jobId: job.id });
      await orden.save();
      return;
    }

    // =========================
    // EVENT: FULFILLMENT_CHANGED
    // =========================
    if (name === "FULFILLMENT_CHANGED") {
      if (!FLAGS.EMAILS_ENABLED) return;

      const { ordenId, nuevoEstado } = payload || {};
      if (!ordenId || !nuevoEstado) return;

      const orden = await Orden.findById(ordenId).populate("usuario", "email nombre");
      if (!orden) return;

      const to = extractEmail(orden);
      if (!to || !EmailService?.enviarCorreoCambioEstado) return;

      const key = ledgerKey("fulfillment", nuevoEstado);
      if (hasLedger(orden, key)) return;

      await EmailService.enviarCorreoCambioEstado({ to, orden, nuevoEstado });
      pushLedger(orden, key, { nuevoEstado, jobId: job.id });
      await orden.save();
      return;
    }
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`✅ Event processed: ${job.name} (${job.id})`);
});

worker.on("failed", (job, err) => {
  console.log(`❌ Event failed: ${job?.name} (${job?.id})`, err?.message || err);
});

module.exports = { worker };