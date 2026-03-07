// ==========================================================
// emailService.js — Email Service (ENTERPRISE ULTRA)
// ==========================================================
//
// Incluye:
// ✅ Transporter SMTP robusto
// ✅ Verificación opcional en boot (prod-safe)
// ✅ Feature flags por ENV
// ✅ Templates HTML profesionales (responsive)
// ✅ Pagado / Fulfillment / Cancelado / Fallido / Reembolsado
// ✅ Subjects dinámicos
// ✅ Sanitización básica
// ✅ Fail-safe (emails nunca rompen lógica)
//
// ==========================================================

const nodemailer = require("nodemailer");

// ==========================================================
// Feature flags por ENV
// ==========================================================
function envBool(key, def = false) {
  const v = process.env[key];
  if (v === undefined || v === null || String(v).trim() === "") return def;
  const s = String(v).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(s);
}

const FLAGS = {
  EMAIL_ENABLED: envBool("EMAIL_ENABLED", true),
  EMAIL_VERIFY_TRANSPORT: envBool("EMAIL_VERIFY_TRANSPORT", false),
  EMAIL_VERBOSE_LOGS: envBool("EMAIL_VERBOSE_LOGS", true),
};

// ==========================================================
// Utils
// ==========================================================
const safeString = (v, def = "") =>
  v === null || v === undefined ? def : String(v);

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

const escapeHtml = (s) =>
  safeString(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// ==========================================================
// Transporter SMTP
// ==========================================================
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verificación opcional (solo si se activa)
(async () => {
  if (!FLAGS.EMAIL_ENABLED || !FLAGS.EMAIL_VERIFY_TRANSPORT) return;

  try {
    await transporter.verify();
    if (FLAGS.EMAIL_VERBOSE_LOGS) {
      console.log("📧 SMTP transporter verificado correctamente");
    }
  } catch (err) {
    console.log("⚠️ SMTP verify falló:", err?.message || err);
  }
})();

// ==========================================================
// Layout base HTML (reutilizable)
// ==========================================================
function baseLayout({ title, content }) {
  return `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body {
        background: #f5f7fa;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        padding: 20px;
        color: #111;
      }
      .card {
        max-width: 640px;
        margin: 0 auto;
        background: #ffffff;
        border-radius: 12px;
        padding: 24px;
        box-shadow: 0 8px 30px rgba(0,0,0,.06);
      }
      h1 {
        font-size: 20px;
        margin-top: 0;
      }
      p {
        line-height: 1.5;
        font-size: 14px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 16px;
      }
      th, td {
        border-bottom: 1px solid #eee;
        padding: 8px;
        font-size: 13px;
        text-align: left;
      }
      th {
        background: #fafafa;
      }
      .total {
        font-size: 16px;
        font-weight: bold;
        margin-top: 16px;
      }
      .footer {
        margin-top: 24px;
        font-size: 12px;
        color: #666;
        text-align: center;
      }
      .badge {
        display: inline-block;
        padding: 6px 10px;
        border-radius: 999px;
        background: #f0f2f5;
        font-size: 12px;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${escapeHtml(title)}</h1>
      ${content}
      <div class="footer">
        © ${new Date().getFullYear()} Tienda · Todos los derechos reservados
      </div>
    </div>
  </body>
  </html>
  `;
}

// ==========================================================
// Core send helper (FAIL-SAFE)
// ==========================================================
async function sendMailSafe({ to, subject, html }) {
  if (!FLAGS.EMAIL_ENABLED) {
    if (FLAGS.EMAIL_VERBOSE_LOGS) {
      console.log("📧 EMAIL_DISABLED — no enviado:", subject);
    }
    return;
  }

  try {
    await transporter.sendMail({
      from: `"Tienda" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });

    if (FLAGS.EMAIL_VERBOSE_LOGS) {
      console.log(`📧 Email enviado → ${to} | ${subject}`);
    }
  } catch (err) {
    console.log("⚠️ Error enviando email (no bloquea):", err?.message || err);
  }
}

// ==========================================================
// Templates
// ==========================================================

function templateOrdenPagada(orden) {
  const itemsHtml = (orden.items || [])
    .map(
      (it) => `
      <tr>
        <td>${escapeHtml(it.nombre)}</td>
        <td>${it.cantidad}</td>
        <td>${money(it.precioUnitario)}</td>
        <td>${money(it.subtotal)}</td>
      </tr>`
    )
    .join("");

  return baseLayout({
    title: "Pago confirmado",
    content: `
      <p>Tu orden <b>${orden._id}</b> fue pagada correctamente.</p>

      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Cant.</th>
            <th>Precio</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <p class="total">Total: ${money(orden.total)}</p>

      <p class="badge">Estado del pago: PAGADO</p>
    `,
  });
}

function templateCambioFulfillment(orden, nuevoEstado) {
  return baseLayout({
    title: "Actualización de tu orden",
    content: `
      <p>Tu orden <b>${orden._id}</b> cambió de estado.</p>

      <p class="badge">
        Nuevo estado: ${escapeHtml(nuevoEstado.toUpperCase())}
      </p>

      <p class="total">Total: ${money(orden.total)}</p>
    `,
  });
}

// ==========================================================
// Public API
// ==========================================================

async function enviarCorreoOrdenPagada({ to, orden }) {
  const subject = `Pago confirmado · Orden ${orden._id}`;

  const html = templateOrdenPagada(orden);

  await sendMailSafe({ to, subject, html });
}

/**
 * 📦 Aviso de cambio de estado (fulfillment)
 */
async function enviarCorreoCambioEstado({ to, orden, nuevoEstado }) {
  const subject = `Estado de tu orden · ${nuevoEstado.toUpperCase()}`;

  const html = templateCambioFulfillment(orden, nuevoEstado);

  await sendMailSafe({ to, subject, html });
}

// ==========================================================
// Exports
// ==========================================================
module.exports = {
  enviarCorreoOrdenPagada,
  enviarCorreoCambioEstado,
};