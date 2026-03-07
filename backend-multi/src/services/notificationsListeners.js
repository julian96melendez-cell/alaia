const bus = require("./eventBus");
const NotificationLog = require("../models/NotificationLog");
const Orden = require("../models/Orden");
const { sendEmail } = require("./emailService");

// helper: idempotencia por DB
async function alreadyNotified({ ordenId, type }) {
  try {
    await NotificationLog.create({ ordenId, type, channel: "email", status: "sent" });
    return false; // se creó => no existía
  } catch (e) {
    if (e?.code === 11000) return true; // ya existía
    throw e;
  }
}

function renderTemplate(type, orden) {
  const total = Number(orden.total || 0).toFixed(2);
  const moneda = String(orden.moneda || "usd").toUpperCase();

  const items = (orden.items || [])
    .map((i) => `<li>${i.nombre} x${i.cantidad} — ${moneda} ${Number(i.subtotal || 0).toFixed(2)}</li>`)
    .join("");

  if (type === "paid") {
    return {
      subject: "✅ Pago confirmado",
      html: `
        <div style="font-family:Arial">
          <h2>Pago confirmado</h2>
          <p>Tu orden <b>${orden._id}</b> fue pagada correctamente.</p>
          <p><b>Total:</b> ${moneda} ${total}</p>
          <p><b>Productos:</b></p>
          <ul>${items}</ul>
          <p>Puedes ver el estado aquí: <b>${process.env.FRONTEND_URL || ""}/orden/${orden._id}</b></p>
        </div>
      `,
    };
  }

  if (type === "shipped") {
    return {
      subject: "📦 Tu pedido fue enviado",
      html: `
        <div style="font-family:Arial">
          <h2>Tu pedido fue enviado</h2>
          <p>Orden: <b>${orden._id}</b></p>
          <p>Gracias por comprar con nosotros.</p>
          <p>Estado: <b>Enviado</b></p>
        </div>
      `,
    };
  }

  if (type === "delivered") {
    return {
      subject: "🎉 Pedido entregado",
      html: `
        <div style="font-family:Arial">
          <h2>Pedido entregado</h2>
          <p>Orden: <b>${orden._id}</b></p>
          <p>¡Esperamos que lo disfrutes!</p>
        </div>
      `,
    };
  }

  if (type === "failed") {
    return {
      subject: "⚠️ Problema con el pago",
      html: `
        <div style="font-family:Arial">
          <h2>Problema con el pago</h2>
          <p>Orden: <b>${orden._id}</b></p>
          <p>Tu pago no pudo completarse. Puedes reintentar desde la app.</p>
        </div>
      `,
    };
  }

  return { subject: "Actualización de tu pedido", html: "<div>Actualización</div>" };
}

async function notify({ ordenId, type }) {
  // 1) idempotencia
  const dup = await alreadyNotified({ ordenId, type });
  if (dup) return;

  // 2) obtener orden (y usuario para email)
  const orden = await Orden.findById(ordenId).populate("usuario", "email nombre").lean();
  if (!orden) return;

  const to = orden.usuario?.email;
  if (!to) return;

  // 3) enviar email
  const { subject, html } = renderTemplate(type, orden);

  try {
    await sendEmail({ to, subject, html });
    await NotificationLog.updateOne(
      { ordenId, type, channel: "email" },
      { $set: { to, status: "sent" } }
    );
  } catch (e) {
    await NotificationLog.updateOne(
      { ordenId, type, channel: "email" },
      { $set: { to, status: "failed", errorMessage: e.message || "email_error" } }
    );
  }
}

// =====================
// Eventos que escuchamos
// =====================
bus.on("order.paid", async ({ ordenId }) => notify({ ordenId, type: "paid" }));
bus.on("order.failed", async ({ ordenId }) => notify({ ordenId, type: "failed" }));
bus.on("order.shipped", async ({ ordenId }) => notify({ ordenId, type: "shipped" }));
bus.on("order.delivered", async ({ ordenId }) => notify({ ordenId, type: "delivered" }));

module.exports = {};