"use strict";

const mongoose = require("mongoose");
const Orden = require("../models/Orden");

// ==========================================================
// Helpers base (HTTP)
// ==========================================================
const send = (res, statusCode, payload) => res.status(statusCode).json(payload);

const ok = (res, { message = "OK", data = null, meta = null } = {}) =>
  send(res, 200, { ok: true, message, data, meta });

const bad = (res, message = "Bad Request", extra = {}) =>
  send(res, 400, { ok: false, message, ...extra });

const forbidden = (res, message = "Acceso denegado") =>
  send(res, 403, { ok: false, message });

const serverError = (res, message = "Error interno", extra = {}) =>
  send(res, 500, { ok: false, message, ...extra });

// ==========================================================
// Helpers utilitarios
// ==========================================================
const safeInt = (v, def = 0) => {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : def;
};

const safeString = (v, def = "") => (typeof v === "string" ? v.trim() : def);

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function getRequestId(req) {
  return (
    req.reqId ||
    req.headers["x-request-id"] ||
    req.headers["x-correlation-id"] ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function log(level, msg, ctx = {}) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg,
      ...ctx,
    })
  );
}

function safeDate(value) {
  const v = safeString(value);
  if (!v) return null;

  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function buildDateRange(req) {
  const days = clamp(safeInt(req.query.days, 30), 1, 365);

  const fromQuery = safeDate(req.query.from);
  const toQuery = safeDate(req.query.to);

  let to = toQuery ? endOfDay(toQuery) : endOfDay(new Date());
  let from = fromQuery ? startOfDay(fromQuery) : startOfDay(addDays(to, -(days - 1)));

  if (from > to) {
    const tmp = from;
    from = startOfDay(to);
    to = endOfDay(tmp);
  }

  return { from, to, days };
}

function buildMatchByDate(from, to) {
  return {
    createdAt: {
      $gte: from,
      $lte: to,
    },
  };
}

function isAdmin(req) {
  return req?.usuario?.rol === "admin";
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ==========================================================
// GET /api/admin/analytics/overview
// ==========================================================
exports.adminAnalyticsOverview = async (req, res) => {
  const reqId = getRequestId(req);

  try {
    if (!isAdmin(req)) return forbidden(res);

    const { from, to, days } = buildDateRange(req);
    const match = buildMatchByDate(from, to);

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: null,
          totalOrdenes: { $sum: 1 },
          ingresosBrutos: { $sum: "$total" },
          totalCostoProveedor: { $sum: "$totalCostoProveedor" },
          totalGanancia: { $sum: "$gananciaTotal" },
          totalComisiones: { $sum: "$comisionTotal" },
          totalNetoVendedores: { $sum: "$ingresoVendedorTotal" },

          pagadas: {
            $sum: { $cond: [{ $eq: ["$estadoPago", "pagado"] }, 1, 0] },
          },
          pendientes: {
            $sum: { $cond: [{ $eq: ["$estadoPago", "pendiente"] }, 1, 0] },
          },
          fallidas: {
            $sum: { $cond: [{ $eq: ["$estadoPago", "fallido"] }, 1, 0] },
          },
          reembolsadas: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ["$estadoPago", "reembolsado"] },
                    { $eq: ["$estadoPago", "reembolsado_parcial"] },
                  ],
                },
                1,
                0,
              ],
            },
          },

          payoutsPendientes: {
            $sum: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$vendedorPayouts", []] },
                  as: "p",
                  cond: { $eq: ["$$p.status", "pendiente"] },
                },
              },
            },
          },
          payoutsPagados: {
            $sum: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$vendedorPayouts", []] },
                  as: "p",
                  cond: { $eq: ["$$p.status", "pagado"] },
                },
              },
            },
          },
          payoutsFallidos: {
            $sum: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$vendedorPayouts", []] },
                  as: "p",
                  cond: { $eq: ["$$p.status", "fallido"] },
                },
              },
            },
          },
          payoutsBloqueados: {
            $sum: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$vendedorPayouts", []] },
                  as: "p",
                  cond: { $eq: ["$$p.status", "bloqueado"] },
                },
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalOrdenes: 1,
          ingresosBrutos: 1,
          totalCostoProveedor: 1,
          totalGanancia: 1,
          totalComisiones: 1,
          totalNetoVendedores: 1,
          pagadas: 1,
          pendientes: 1,
          fallidas: 1,
          reembolsadas: 1,
          payoutsPendientes: 1,
          payoutsPagados: 1,
          payoutsFallidos: 1,
          payoutsBloqueados: 1,
        },
      },
    ];

    const [row] = await Orden.aggregate(pipeline);

    return ok(res, {
      message: "Analytics overview",
      data:
        row || {
          totalOrdenes: 0,
          ingresosBrutos: 0,
          totalCostoProveedor: 0,
          totalGanancia: 0,
          totalComisiones: 0,
          totalNetoVendedores: 0,
          pagadas: 0,
          pendientes: 0,
          fallidas: 0,
          reembolsadas: 0,
          payoutsPendientes: 0,
          payoutsPagados: 0,
          payoutsFallidos: 0,
          payoutsBloqueados: 0,
        },
      meta: {
        from,
        to,
        days,
        reqId,
      },
    });
  } catch (err) {
    log("error", "adminAnalyticsOverview error", {
      reqId,
      err: err?.message || String(err),
    });

    return serverError(res, "Error interno en analytics overview", { reqId });
  }
};

// ==========================================================
// GET /api/admin/analytics/series
// Serie diaria de órdenes/ingresos
// ==========================================================
exports.adminAnalyticsSeries = async (req, res) => {
  const reqId = getRequestId(req);

  try {
    if (!isAdmin(req)) return forbidden(res);

    const { from, to, days } = buildDateRange(req);
    const match = buildMatchByDate(from, to);

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            y: { $year: "$createdAt" },
            m: { $month: "$createdAt" },
            d: { $dayOfMonth: "$createdAt" },
          },
          totalOrdenes: { $sum: 1 },
          ingresos: { $sum: "$total" },
          ganancia: { $sum: "$gananciaTotal" },
          pagadas: {
            $sum: { $cond: [{ $eq: ["$estadoPago", "pagado"] }, 1, 0] },
          },
          pendientes: {
            $sum: { $cond: [{ $eq: ["$estadoPago", "pendiente"] }, 1, 0] },
          },
          fallidas: {
            $sum: { $cond: [{ $eq: ["$estadoPago", "fallido"] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          date: {
            $dateFromParts: {
              year: "$_id.y",
              month: "$_id.m",
              day: "$_id.d",
            },
          },
          totalOrdenes: 1,
          ingresos: 1,
          ganancia: 1,
          pagadas: 1,
          pendientes: 1,
          fallidas: 1,
        },
      },
      { $sort: { date: 1 } },
    ];

    const rows = await Orden.aggregate(pipeline);

    return ok(res, {
      message: "Analytics series",
      data: rows.map((r) => ({
        ...r,
        ingresos: round2(r.ingresos),
        ganancia: round2(r.ganancia),
      })),
      meta: {
        from,
        to,
        days,
        reqId,
      },
    });
  } catch (err) {
    log("error", "adminAnalyticsSeries error", {
      reqId,
      err: err?.message || String(err),
    });

    return serverError(res, "Error interno en analytics series", { reqId });
  }
};

// ==========================================================
// GET /api/admin/analytics/top-productos
// ==========================================================
exports.adminAnalyticsTopProductos = async (req, res) => {
  const reqId = getRequestId(req);

  try {
    if (!isAdmin(req)) return forbidden(res);

    const { from, to, days } = buildDateRange(req);
    const limit = clamp(safeInt(req.query.limit, 10), 1, 50);

    const pipeline = [
      { $match: buildMatchByDate(from, to) },
      { $unwind: "$items" },
      {
        $group: {
          _id: {
            producto: "$items.producto",
            nombre: "$items.nombre",
          },
          cantidadVendida: { $sum: "$items.cantidad" },
          ingresos: { $sum: "$items.subtotal" },
          ganancia: { $sum: "$items.ganancia" },
        },
      },
      {
        $project: {
          _id: 0,
          productoId: "$_id.producto",
          nombre: "$_id.nombre",
          cantidadVendida: 1,
          ingresos: 1,
          ganancia: 1,
        },
      },
      { $sort: { ingresos: -1, cantidadVendida: -1 } },
      { $limit: limit },
    ];

    const rows = await Orden.aggregate(pipeline);

    return ok(res, {
      message: "Top productos",
      data: rows.map((r) => ({
        ...r,
        ingresos: round2(r.ingresos),
        ganancia: round2(r.ganancia),
      })),
      meta: {
        from,
        to,
        days,
        limit,
        reqId,
      },
    });
  } catch (err) {
    log("error", "adminAnalyticsTopProductos error", {
      reqId,
      err: err?.message || String(err),
    });

    return serverError(res, "Error interno en top productos", { reqId });
  }
};

// ==========================================================
// GET /api/admin/analytics/top-vendedores
// ==========================================================
exports.adminAnalyticsTopVendedores = async (req, res) => {
  const reqId = getRequestId(req);

  try {
    if (!isAdmin(req)) return forbidden(res);

    const { from, to, days } = buildDateRange(req);
    const limit = clamp(safeInt(req.query.limit, 10), 1, 50);
    const userCollection =
      (UsuarioModel && UsuarioModel.collection && UsuarioModel.collection.name) ||
      (process.env.USER_COLLECTION || "").trim() ||
      "usuarios";

    const pipeline = [
      { $match: buildMatchByDate(from, to) },
      { $unwind: "$vendedorPayouts" },
      {
        $group: {
          _id: "$vendedorPayouts.vendedor",
          montoTotal: { $sum: "$vendedorPayouts.monto" },
          payoutsCount: { $sum: 1 },
          pagadosCount: {
            $sum: {
              $cond: [{ $eq: ["$vendedorPayouts.status", "pagado"] }, 1, 0],
            },
          },
          pendientesCount: {
            $sum: {
              $cond: [{ $eq: ["$vendedorPayouts.status", "pendiente"] }, 1, 0],
            },
          },
          fallidosCount: {
            $sum: {
              $cond: [{ $eq: ["$vendedorPayouts.status", "fallido"] }, 1, 0],
            },
          },
        },
      },
      {
        $lookup: {
          from: userCollection,
          localField: "_id",
          foreignField: "_id",
          as: "usuarioDoc",
        },
      },
      {
        $unwind: {
          path: "$usuarioDoc",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          vendedorId: "$_id",
          nombre: { $ifNull: ["$usuarioDoc.nombre", ""] },
          email: { $ifNull: ["$usuarioDoc.email", ""] },
          montoTotal: 1,
          payoutsCount: 1,
          pagadosCount: 1,
          pendientesCount: 1,
          fallidosCount: 1,
        },
      },
      { $sort: { montoTotal: -1, payoutsCount: -1 } },
      { $limit: limit },
    ];

    const rows = await Orden.aggregate(pipeline);

    return ok(res, {
      message: "Top vendedores",
      data: rows.map((r) => ({
        ...r,
        montoTotal: round2(r.montoTotal),
      })),
      meta: {
        from,
        to,
        days,
        limit,
        reqId,
      },
    });
  } catch (err) {
    log("error", "adminAnalyticsTopVendedores error", {
      reqId,
      err: err?.message || String(err),
    });

    return serverError(res, "Error interno en top vendedores", { reqId });
  }
};