// ======================================================
// stripeController.js — Stripe Checkout ENTERPRISE (ULTRA MARKETPLACE)
// ======================================================
//
// ✅ Stripe Checkout robusto
// ✅ Crea orden cuando el checkout viene con items (POST /stripe/checkout)
// ✅ Soporta cobrar una orden existente (crearSesionDesdeOrdenId)
// ✅ Anti doble cobro REAL (pagada = bloquea)
// ✅ Reutiliza sesión Stripe existente si todavía es válida (devuelve session.url)
// ✅ Si la sesión existente está expirada/invalid -> limpia stripeSessionId y crea una nueva
// ✅ Idempotencia (header Idempotency-Key)
// ✅ Valida dueño o admin
// ✅ line_items construidos desde Orden.items (fuente de verdad)
// ✅ Marketplace snapshot por item:
//    - vendedor (vendedorId si existe en Producto)
//    - comisionPct, comisionMonto, netoVendedor
// ✅ Reserva stock atómica cuando gestionStock=true (anti over-sell)
// ✅ Respuestas consistentes, sin quitar funcionalidades
//
// NOTA:
// - Este controller NO marca pagado. Eso lo hace el WEBHOOK de Stripe.
//
// ======================================================

const mongoose = require("mongoose");
const Orden = require("../models/Orden");
const Producto = require("../models/Producto");

// (Opcional) Vendedor model: si no existe, el controller funciona igual
let Vendedor = null;
try {
  // Ajusta si tu path es distinto
  Vendedor = require("../models/Vendedor");
} catch (_) {
  Vendedor = null;
}

// ⚠️ Ajusta el path si tu stripeService está en otra carpeta
const { crearSesionPago, stripe } = require("./stripeService");

// -----------------------------
// Utils
// -----------------------------
const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const getUsuarioId = (req) => String(req.usuario?._id || req.usuario?.id || "");

const isAdmin = (req) => req.usuario?.rol === "admin";

const getCurrency = () => (process.env.STRIPE_CURRENCY || "usd").toLowerCase();

// Comisión default plataforma (si el producto no define comisionPct)
const getPlatformCommissionPct = () => {
  const v = Number(process.env.PLATFORM_COMMISSION_PCT ?? 10);
  if (!Number.isFinite(v)) return 10;
  return Math.max(0, Math.min(80, v));
};

// Header recomendado: "Idempotency-Key"
const getIdempotencyKey = (req) =>
  req.headers["idempotency-key"] ||
  req.headers["Idempotency-Key"] ||
  req.headers["x-idempotency-key"] ||
  null;

const ok = (res, payload, status = 200) => res.status(status).json(payload);

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const safeNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const safeStr = (v, fallback = "") =>
  v === null || v === undefined ? fallback : String(v);

function toCents(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

// -----------------------------
// Anti doble cobro (ENTERPRISE)
// -----------------------------
function validarOrdenParaCobro(orden) {
  if (!orden) return;

  if (orden.estadoPago === "pagado") {
    const err = new Error("Esta orden ya fue pagada. No se puede volver a cobrar.");
    err.statusCode = 409;
    throw err;
  }
}

// -----------------------------
// Reutilizar sesión Stripe existente (ENTERPRISE PRO)
// -----------------------------
async function tryReuseStripeSessionOrReset({ orden }) {
  if (!orden?.stripeSessionId) return { reused: false, url: null, sessionId: null };

  try {
    const existingSession = await stripe.checkout.sessions.retrieve(orden.stripeSessionId);

    if (existingSession?.url) {
      return { reused: true, url: existingSession.url, sessionId: existingSession.id };
    }

    console.log("⚠️ Sesión Stripe existente sin URL. Se regenerará.");
  } catch (err) {
    console.log("⚠️ Sesión Stripe previa inválida/expirada. Se regenerará:", err?.message);
  }

  orden.stripeSessionId = null;
  await orden.save();

  return { reused: false, url: null, sessionId: null };
}

// -----------------------------
// Construir lineItems desde Orden.items (fuente de verdad)
// -----------------------------
function construirLineItemsDesdeOrden({ orden, currency }) {
  const items = Array.isArray(orden?.items) ? orden.items : [];

  if (!items.length) {
    const err = new Error("La orden no tiene items para cobrar.");
    err.statusCode = 400;
    throw err;
  }

  const lineItems = [];
  let totalCalculado = 0;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];

    const nombre = String(it?.nombre || "Producto");
    const qty = Math.max(1, parseInt(it?.cantidad, 10) || 1);

    const precioUnitario = Number(it?.precioUnitario ?? it?.precio ?? 0);

    const cents = toCents(precioUnitario);
    if (!cents) {
      const err = new Error(`Item inválido: "${nombre}" no tiene precioUnitario válido.`);
      err.statusCode = 400;
      err.debug = { index: i, nombre, precioUnitario };
      throw err;
    }

    lineItems.push({
      price_data: {
        currency,
        product_data: { name: nombre },
        unit_amount: cents,
      },
      quantity: qty,
    });

    totalCalculado = round2(totalCalculado + precioUnitario * qty);
  }

  const totalOrden = round2(Number(orden.total || 0));
  const diff = Math.abs(round2(totalOrden - totalCalculado));

  if (totalOrden <= 0) {
    const err = new Error("La orden tiene total inválido (<=0).");
    err.statusCode = 400;
    err.debug = { totalOrden };
    throw err;
  }

  if (diff > 0.05) {
    const err = new Error(
      `Inconsistencia detectada: totalOrden (${totalOrden}) != totalCalculado (${totalCalculado}).`
    );
    err.statusCode = 409;
    err.debug = { totalOrden, totalCalculado, diff };
    throw err;
  }

  return lineItems;
}

// -----------------------------
// Marketplace: resolver comisión por producto
// Regla:
// 1) producto.comisionPct (si existe y es número)
// 2) vendedor.comisionDefaultPct (si existe y tienes modelo Vendedor)
// 3) PLATFORM_COMMISSION_PCT (ENV)
// -----------------------------
async function resolverComisionPct({ producto }) {
  const p = producto?.comisionPct;
  if (p !== null && p !== undefined && Number.isFinite(Number(p))) {
    return Math.max(0, Math.min(80, Number(p)));
  }

  const vendedorId =
    producto?.vendedorId || producto?.vendedor || producto?.sellerId || null;

  if (vendedorId && Vendedor) {
    const vend = await Vendedor.findById(vendedorId)
      .select("comisionDefaultPct estado")
      .lean()
      .catch(() => null);

    const vPct = Number(vend?.comisionDefaultPct);
    if (Number.isFinite(vPct)) {
      return Math.max(0, Math.min(80, vPct));
    }
  }

  return getPlatformCommissionPct();
}

// -----------------------------
// Stock reserve (anti oversell)
// - Si gestionStock=true, exige stock >= cantidad y descuenta.
// - Si gestionStock=false, no toca stock.
// - Se usa dentro de transacción si hay sesión.
// -----------------------------
async function reservarStockAtomico({ productoId, cantidad, session }) {
  const qty = Math.max(1, parseInt(cantidad, 10) || 1);

  // Solo descuenta si gestionStock true y stock suficiente
  const res = await Producto.updateOne(
    { _id: productoId, activo: true, visible: true, gestionStock: true, stock: { $gte: qty } },
    { $inc: { stock: -qty } },
    session ? { session } : undefined
  );

  // Si no modificó, puede ser porque:
  // - gestionStock=false (no matchea el filtro) => no es error
  // - stock insuficiente => error
  // - producto no activo/visible => error
  if (res?.modifiedCount === 1) return { reserved: true };

  // Si no reservó, revisa si gestionStock está apagado (permitimos)
  const p = await Producto.findById(productoId)
    .select("gestionStock stock activo visible")
    .lean()
    .session(session || null)
    .catch(() => null);

  if (!p || p.activo === false || p.visible === false) {
    const err = new Error("Producto no disponible (inactivo/no visible).");
    err.statusCode = 404;
    throw err;
  }

  if (p.gestionStock === false) {
    return { reserved: false, reason: "STOCK_NOT_MANAGED" };
  }

  const err = new Error("Stock insuficiente para este producto.");
  err.statusCode = 409;
  err.debug = { productoId: String(productoId), stock: p.stock, qty };
  throw err;
}

// -----------------------------
// Crear Orden desde items [{ producto, cantidad }]
// - Marketplace snapshot (vendedor + comision)
// - Reserva stock si aplica
// - Transacción best-effort (si Mongo lo soporta)
// -----------------------------
async function crearOrdenDesdeItems({ usuarioId, items, metodoPago = "stripe" }) {
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error("Debes enviar items (array) con al menos 1 producto.");
    err.statusCode = 400;
    throw err;
  }

  for (const it of items) {
    if (!it?.producto || !isObjectId(String(it.producto))) {
      const err = new Error("Cada item debe incluir producto (ObjectId válido).");
      err.statusCode = 400;
      err.debug = { item: it };
      throw err;
    }
  }

  const ids = items.map((i) => String(i.producto));

  // Solo productos activos y visibles (catálogo público)
  const productos = await Producto.find({
    _id: { $in: ids },
    activo: true,
    visible: true,
  });

  const map = new Map(productos.map((p) => [String(p._id), p]));

  // Intentar transacción (si tu MongoDB lo soporta)
  const session = await mongoose.startSession().catch(() => null);

  try {
    if (session) session.startTransaction();

    const itemsOrden = [];
    let total = 0;
    let totalCostoProveedor = 0;

    // Marketplace totals
    let totalComisiones = 0;
    let totalNetoVendedores = 0;

    for (const it of items) {
      const producto = map.get(String(it.producto));
      if (!producto) {
        const err = new Error(`Producto no disponible: ${it.producto}`);
        err.statusCode = 404;
        throw err;
      }

      if (producto.tipo === "afiliado") {
        const err = new Error(
          `El producto "${producto.nombre}" es afiliado y no se puede comprar dentro del sistema.`
        );
        err.statusCode = 400;
        throw err;
      }

      const cantidad = Math.max(1, parseInt(it.cantidad, 10) || 1);

      // Reservar stock si aplica (anti oversell)
      await reservarStockAtomico({
        productoId: producto._id,
        cantidad,
        session,
      });

      const precioUnitario = safeNumber(producto.precioFinal, 0);
      const costoProveedorUnitario = safeNumber(producto.costoProveedor, 0);

      if (precioUnitario <= 0) {
        const err = new Error(`Producto "${producto.nombre}" no tiene precioFinal válido (>0).`);
        err.statusCode = 400;
        throw err;
      }

      if (costoProveedorUnitario < 0) {
        const err = new Error(`Producto "${producto.nombre}" no tiene costoProveedor válido (>=0).`);
        err.statusCode = 400;
        throw err;
      }

      const subtotal = round2(precioUnitario * cantidad);
      const costoTotalProveedor = round2(costoProveedorUnitario * cantidad);
      const ganancia = round2(Math.max(0, subtotal - costoTotalProveedor));

      // Marketplace snapshot
      const vendedorId =
        producto.vendedorId || producto.vendedor || producto.sellerId || null;

      const comisionPct = await resolverComisionPct({ producto });
      const comisionMonto = round2((subtotal * comisionPct) / 100);
      const netoVendedor = round2(Math.max(0, subtotal - comisionMonto));

      itemsOrden.push({
        producto: producto._id,
        nombre: producto.nombre,
        cantidad,
        precioUnitario: round2(precioUnitario),
        costoProveedorUnitario: round2(costoProveedorUnitario),
        proveedor: producto.proveedor || "local",
        tipoProducto: producto.tipo || "marketplace",
        subtotal,
        ganancia,

        // ✅ Marketplace fields (requiere que Orden ItemSchema los tenga)
        vendedor: vendedorId || null,
        comisionPct,
        comisionMonto,
        netoVendedor,
      });

      total = round2(total + subtotal);
      totalCostoProveedor = round2(totalCostoProveedor + costoTotalProveedor);

      totalComisiones = round2(totalComisiones + comisionMonto);
      totalNetoVendedores = round2(totalNetoVendedores + netoVendedor);
    }

    const orden = await Orden.create(
      [
        {
          usuario: usuarioId,
          items: itemsOrden,

          // breakdown base
          subtotal: total,
          shipping: 0,
          tax: 0,
          discount: 0,

          total,
          totalCostoProveedor,
          gananciaTotal: round2(total - totalCostoProveedor),

          // marketplace totals (requiere campos en Orden si quieres persistirlos)
          totalComisiones,
          totalNetoVendedores,

          metodoPago,
          paymentProvider: metodoPago,
          estadoPago: "pendiente",
          estadoFulfillment: "pendiente",

          moneda: getCurrency(),
        },
      ],
      session ? { session } : undefined
    );

    if (session) await session.commitTransaction();

    return orden?.[0] || orden;
  } catch (err) {
    if (session) {
      await session.abortTransaction().catch(() => {});
    }
    throw err;
  } finally {
    if (session) session.endSession();
  }
}

// -----------------------------
// Crear sesión Stripe desde una ORDEN ya construida
// -----------------------------
async function crearSesionStripeDesdeOrden({ req, orden, origen = "orden" }) {
  const currency = getCurrency();
  const idempotencyKeyHeader = getIdempotencyKey(req);

  validarOrdenParaCobro(orden);

  const reuse = await tryReuseStripeSessionOrReset({ orden });
  if (reuse.reused) {
    return { id: reuse.sessionId, url: reuse.url, reused: true };
  }

  const lineItems = construirLineItemsDesdeOrden({ orden, currency });

  const stripeIdemKey = idempotencyKeyHeader
    ? `checkout_${orden._id}_${idempotencyKeyHeader}`
    : `checkout_${orden._id}`;

  const session = await crearSesionPago({
    lineItems,
    metadata: {
      ordenId: String(orden._id),
      usuarioId: String(orden.usuario),
      origen,
    },
    clienteEmail: req.usuario?.email || null,
    idempotencyKey: stripeIdemKey,
  });

  orden.stripeSessionId = session.id;
  await orden.save();

  return session;
}

// ======================================================
// ✅ POST /api/pagos/stripe/checkout
// Body: { items: [{ producto: ObjectId, cantidad: number }] }
// ======================================================
exports.crearSesionDesdeProductos = async (req, res, next) => {
  try {
    const usuarioId = getUsuarioId(req);
    if (!usuarioId) return ok(res, { ok: false, message: "No autenticado" }, 401);

    const { items } = req.body || {};

    const orden = await crearOrdenDesdeItems({
      usuarioId,
      items,
      metodoPago: "stripe",
    });

    const session = await crearSesionStripeDesdeOrden({
      req,
      orden,
      origen: "productos",
    });

    return ok(
      res,
      {
        ok: true,
        message: session?.reused
          ? "Checkout reutilizado correctamente"
          : "Checkout creado correctamente",
        data: {
          ordenId: orden._id,
          sessionId: session.id,
          url: session.url,
          reused: !!session?.reused,
        },
      },
      201
    );
  } catch (err) {
    if (err?.statusCode) {
      return ok(
        res,
        { ok: false, message: err.message, debug: err.debug || undefined },
        err.statusCode
      );
    }
    next(err);
  }
};

// ======================================================
// ✅ POST /api/pagos/stripe/checkout-carrito
// ======================================================
exports.crearSesionDesdeCarrito = async (req, res, next) => {
  try {
    const usuarioId = getUsuarioId(req);
    if (!usuarioId) return ok(res, { ok: false, message: "No autenticado" }, 401);

    const { items } = req.body || {};

    if (Array.isArray(items) && items.length > 0) {
      const orden = await crearOrdenDesdeItems({
        usuarioId,
        items,
        metodoPago: "stripe",
      });

      const session = await crearSesionStripeDesdeOrden({
        req,
        orden,
        origen: "carrito_body_items",
      });

      return ok(
        res,
        {
          ok: true,
          message: session?.reused
            ? "Checkout (carrito) reutilizado correctamente"
            : "Checkout (carrito) creado correctamente",
          data: {
            ordenId: orden._id,
            sessionId: session.id,
            url: session.url,
            reused: !!session?.reused,
          },
        },
        201
      );
    }

    return ok(
      res,
      {
        ok: false,
        message:
          "Carrito no implementado en backend. Envía body.items o implementa un modelo de carrito.",
      },
      400
    );
  } catch (err) {
    if (err?.statusCode) {
      return ok(
        res,
        { ok: false, message: err.message, debug: err.debug || undefined },
        err.statusCode
      );
    }
    next(err);
  }
};

// ======================================================
// ✅ POST /api/pagos/stripe/checkout-orden
// Body: { ordenId: "..." }
// ======================================================
exports.crearSesionDesdeOrdenId = async (req, res, next) => {
  try {
    const usuarioId = getUsuarioId(req);
    const { ordenId } = req.body || {};

    if (!usuarioId) return ok(res, { ok: false, message: "No autenticado" }, 401);

    if (!ordenId || !isObjectId(String(ordenId))) {
      return ok(res, { ok: false, message: "ordenId inválido" }, 400);
    }

    const orden = await Orden.findById(ordenId);
    if (!orden) {
      return ok(res, { ok: false, message: "Orden no encontrada" }, 404);
    }

    const esDueno = String(orden.usuario) === String(usuarioId);
    if (!esDueno && !isAdmin(req)) {
      return ok(res, { ok: false, message: "No autorizado para cobrar esta orden" }, 403);
    }

    const session = await crearSesionStripeDesdeOrden({
      req,
      orden,
      origen: "orden",
    });

    return ok(
      res,
      {
        ok: true,
        message: session?.reused
          ? "Sesión de pago reutilizada correctamente"
          : "Sesión de pago creada correctamente",
        data: {
          ordenId: orden._id,
          sessionId: session.id,
          url: session.url,
          reused: !!session?.reused,
        },
      },
      201
    );
  } catch (err) {
    if (err?.statusCode) {
      return ok(
        res,
        { ok: false, message: err.message, debug: err.debug || undefined },
        err.statusCode
      );
    }
    next(err);
  }
};

// ======================================================
// ✅ GET /api/pagos/estado/:ordenId
// ======================================================
exports.obtenerEstadoPago = async (req, res, next) => {
  try {
    const usuarioId = getUsuarioId(req);
    const { ordenId } = req.params;

    if (!usuarioId) return ok(res, { ok: false, message: "No autenticado" }, 401);

    if (!ordenId || !isObjectId(String(ordenId))) {
      return ok(res, { ok: false, message: "ordenId inválido" }, 400);
    }

    const orden = await Orden.findById(ordenId).lean();
    if (!orden) return ok(res, { ok: false, message: "Orden no encontrada" }, 404);

    const esDueno = String(orden.usuario) === String(usuarioId);
    if (!esDueno && !isAdmin(req)) {
      return ok(res, { ok: false, message: "No autorizado" }, 403);
    }

    return ok(res, {
      ok: true,
      message: "Estado de pago obtenido",
      data: {
        ordenId: orden._id,
        estadoPago: orden.estadoPago,
        estadoFulfillment: orden.estadoFulfillment,
        total: orden.total,
        moneda: (orden.moneda || process.env.STRIPE_CURRENCY || "usd").toLowerCase(),
        stripeSessionId: orden.stripeSessionId || null,
        updatedAt: orden.updatedAt || null,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ======================================================
// ✅ GET /api/pagos/estado?session_id=cs_test_...
// ======================================================
exports.obtenerEstadoPagoPorSession = async (req, res, next) => {
  try {
    const usuarioId = getUsuarioId(req);
    const sessionId = req.query?.session_id;

    if (!usuarioId) return ok(res, { ok: false, message: "No autenticado" }, 401);

    if (!sessionId || typeof sessionId !== "string") {
      return ok(res, { ok: false, message: "session_id requerido" }, 400);
    }

    const orden = await Orden.findOne({ stripeSessionId: sessionId }).lean();
    if (!orden) {
      return ok(res, { ok: false, message: "Orden no encontrada para esa sesión" }, 404);
    }

    const esDueno = String(orden.usuario) === String(usuarioId);
    if (!esDueno && !isAdmin(req)) {
      return ok(res, { ok: false, message: "No autorizado" }, 403);
    }

    return ok(res, {
      ok: true,
      message: "Estado de pago obtenido por sesión",
      data: {
        ordenId: orden._id,
        estadoPago: orden.estadoPago,
        estadoFulfillment: orden.estadoFulfillment,
        total: orden.total,
        stripeSessionId: orden.stripeSessionId || null,
        updatedAt: orden.updatedAt || null,
      },
    });
  } catch (err) {
    next(err);
  }
};