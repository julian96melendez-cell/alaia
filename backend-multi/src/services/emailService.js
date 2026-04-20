"use strict";

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
// Config base
// ==========================================================
const APP_NAME = (process.env.APP_NAME || "Alaia").trim();
const EMAIL_FROM =
  (process.env.SMTP_FROM || process.env.SMTP_USER || "").trim();

const SMTP_HOST = (process.env.SMTP_HOST || "").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = (process.env.SMTP_USER || "").trim();
const SMTP_PASS = process.env.SMTP_PASS || "";

function hasSmtpConfig() {
  return !!(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && EMAIL_FROM);
}

// ==========================================================
// Utils
// ==========================================================
const safeString = (v, def = "") =>
  v === null || v === undefined ? def : String(v);

const money = (n, currency = "USD") => {
  const amount = Number(n || 0);

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: String(currency || "USD").toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
};

const escapeHtml = (s) =>
  safeString(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeEmail = (email) => {
  const value = safeString(email).trim().toLowerCase();
  return value || null;
};

const normalizeEstado = (estado) => safeString(estado).trim().toLowerCase();

function buildOrderLabel(orden) {
  return (
    safeString(orden?.orderNumber) ||
    safeString(orden?._id) ||
    "sin-id"
  );
}

// ==========================================================
// Transporter SMTP
// ==========================================================
let transporter = null;

if (FLAGS.EMAIL_ENABLED && hasSmtpConfig()) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
} else if (FLAGS.EMAIL_ENABLED && FLAGS.EMAIL_VERBOSE_LOGS) {
  console.log("⚠️ Email habilitado pero configuración SMTP incompleta");
}

// Verificación opcional
(async () => {
  if (!FLAGS.EMAIL_ENABLED) return;
  if (!FLAGS.EMAIL_VERIFY_TRANSPORT) return;
  if (!transporter) return;

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
// Layout base HTML
// ==========================================================
function baseLayout({ title, preheader = "", content }) {
  return `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        margin: 0;
        padding: 20px;
        background: #f5f7fa;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #111827;
      }
      .preheader {
        display: none !important;
        visibility: hidden;
        opacity: 0;
        color: transparent;
        height: 0;
        width: 0;
        overflow: hidden;
      }
      .card {
        max-width: 640px;
        margin: 0 auto;
        background: #ffffff;
        border-radius: 16px;
        padding: 28px;
        box-shadow: 0 8px 30px rgba(0,0,0,.06);
        border: 1px solid rgba(15, 23, 42, 0.06);
      }
      .brand {
        font-size: 12px;
        font-weight: 800;
        letter-spacing: .06em;
        text-transform: uppercase;
        color: #4f46e5;
        margin-bottom: 16px;
      }
      h1 {
        font-size: 24px;
        line-height: 1.2;
        margin: 0 0 16px;
        color: #0f172a;
      }
      p {
        line-height: 1.6;
        font-size: 14px;
        color: #334155;
        margin: 0 0 14px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 18px;
        margin-bottom: 18px;
      }
      th, td {
        border-bottom: 1px solid #e5e7eb;
        padding: 10px 8px;
        font-size: 13px;
        text-align: left;
      }
      th {
        background: #f8fafc;
        color: #475569;
        font-weight: 700;
      }
      .total {
        font-size: 16px;
        font-weight: 800;
        color: #0f172a;
        margin-top: 16px;
      }
      .badge {
        display: inline-block;
        padding: 7px 12px;
        border-radius: 999px;
        background: #eef2ff;
        color: #4338ca;
        font-size: 12px;
        font-weight: 700;
        margin-top: 8px;
      }
      .muted {
        color: #64748b;
        font-size: 13px;
      }
      .footer {
        margin-top: 28px;
        padding-top: 18px;
        border-top: 1px solid #e5e7eb;
        font-size: 12px;
        color: #64748b;
        text-align: center;
      }
      @media (max-width: 640px) {
        body {
          padding: 12px;
        }
        .card {
          padding: 20px;
        }
        h1 {
          font-size: 21px;
        }
      }
    </style>
  </head>
  <body>
    <div class="preheader">${escapeHtml(preheader || title)}</div>
    <div class="card">
      <div class="brand">${escapeHtml(APP_NAME)}</div>
      <h1>${escapeHtml(title)}</h1>
      ${content}
      <div class="footer">
        © ${new Date().getFullYear()} ${escapeHtml(APP_NAME)} · Todos los derechos reservados
      </div>
    </div>
  </body>
  </html>
  `;
}

// ==========================================================
// Texto plano fallback
// ==========================================================
function textOrdenPagada(orden) {
  const orderLabel = buildOrderLabel(orden);
  const total = money(orden?.total, orden?.moneda || "USD");

  return [
    `${APP_NAME}`,
    "",
    `Pago confirmado`,
    `Tu orden ${orderLabel} fue pagada correctamente.`,
    `Total: ${total}`,
    "",
    `Gracias por tu compra.`,
  ].join("\n");
}

function textCambioEstado(orden, nuevoEstado) {
  const orderLabel = buildOrderLabel(orden);

  return [
    `${APP_NAME}`,
    "",
    `Actualización de tu orden`,
    `Tu orden ${orderLabel} cambió de estado.`,
    `Nuevo estado: ${safeString(nuevoEstado).toUpperCase()}`,
  ].join("\n");
}

// ==========================================================
// Core send helper (FAIL-SAFE)
// ==========================================================
async function sendMailSafe({ to, subject, html, text = "" }) {
  const email = normalizeEmail(to);

  if (!FLAGS.EMAIL_ENABLED) {
    if (FLAGS.EMAIL_VERBOSE_LOGS) {
      console.log("📧 EMAIL_DISABLED — no enviado:", subject);
    }
    return { ok: false, skipped: true, reason: "EMAIL_DISABLED" };
  }

  if (!transporter) {
    if (FLAGS.EMAIL_VERBOSE_LOGS) {
      console.log("⚠️ SMTP no configurado — email omitido:", subject);
    }
    return { ok: false, skipped: true, reason: "SMTP_NOT_CONFIGURED" };
  }

  if (!email) {
    if (FLAGS.EMAIL_VERBOSE_LOGS) {
      console.log("⚠️ Email inválido u omitido:", to);
    }
    return { ok: false, skipped: true, reason: "INVALID_RECIPIENT" };
  }

  try {
    const info = await transporter.sendMail({
      from: `"${APP_NAME}" <${EMAIL_FROM}>`,
      to: email,
      subject: safeString(subject).slice(0, 200),
      html,
      text: safeString(text).slice(0, 10000),
    });

    if (FLAGS.EMAIL_VERBOSE_LOGS) {
      console.log(`📧 Email enviado → ${email} | ${subject} | messageId=${info?.messageId || ""}`);
    }

    return { ok: true, messageId: info?.messageId || null };
  } catch (err) {
    console.log("⚠️ Error enviando email (no bloquea):", err?.message || err);
    return { ok: false, skipped: false, reason: err?.message || "SEND_FAILED" };
  }
}

// ==========================================================
// Templates
// ==========================================================
function templateOrdenPagada(orden) {
  const items = Array.isArray(orden?.items) ? orden.items : [];
  const moneda = orden?.moneda || "USD";
  const orderLabel = buildOrderLabel(orden);

  const itemsHtml = items
    .map(
      (it) => `
      <tr>
        <td>${escapeHtml(it?.nombre || "Producto")}</td>
        <td>${Number(it?.cantidad || 0)}</td>
        <td>${money(it?.precioUnitario, moneda)}</td>
        <td>${money(it?.subtotal, moneda)}</td>
      </tr>`
    )
    .join("");

  return baseLayout({
    title: "Pago confirmado",
    preheader: `Tu orden ${orderLabel} fue pagada correctamente`,
    content: `
      <p>Tu orden <strong>${escapeHtml(orderLabel)}</strong> fue pagada correctamente.</p>

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

      <p class="total">Total: ${money(orden?.total, moneda)}</p>
      <div class="badge">Estado del pago: PAGADO</div>

      <p class="muted">
        Te avisaremos si hay cambios relevantes en el estado de tu pedido.
      </p>
    `,
  });
}

function templateCambioFulfillment(orden, nuevoEstado) {
  const orderLabel = buildOrderLabel(orden);
  const estado = normalizeEstado(nuevoEstado);

  return baseLayout({
    title: "Actualización de tu orden",
    preheader: `Tu orden ${orderLabel} cambió a ${estado}`,
    content: `
      <p>Tu orden <strong>${escapeHtml(orderLabel)}</strong> cambió de estado.</p>

      <div class="badge">
        Nuevo estado: ${escapeHtml(safeString(estado).toUpperCase())}
      </div>

      <p class="total">Total: ${money(orden?.total, orden?.moneda || "USD")}</p>
    `,
  });
}

// ==========================================================
// Public API
// ==========================================================
async function enviarCorreoOrdenPagada({ to, orden }) {
  const orderLabel = buildOrderLabel(orden);
  const subject = `Pago confirmado · Orden ${orderLabel}`;
  const html = templateOrdenPagada(orden);
  const text = textOrdenPagada(orden);

  return sendMailSafe({ to, subject, html, text });
}

async function enviarCorreoCambioEstado({ to, orden, nuevoEstado }) {
  const estado = safeString(nuevoEstado).toUpperCase();
  const subject = `Estado de tu orden · ${estado}`;
  const html = templateCambioFulfillment(orden, nuevoEstado);
  const text = textCambioEstado(orden, nuevoEstado);

  return sendMailSafe({ to, subject, html, text });
}

// ==========================================================
// Exports
// ==========================================================
module.exports = {
  enviarCorreoOrdenPagada,
  enviarCorreoCambioEstado,
};