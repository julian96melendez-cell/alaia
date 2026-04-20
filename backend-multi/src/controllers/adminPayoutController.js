"use strict";

const mongoose = require("mongoose");
const Orden = require("../models/Orden");
const { pagarVendedoresDeOrden } = require("../services/payoutService");

// ==========================================================
// Helpers base (HTTP)
// ==========================================================
const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const send = (res, statusCode, payload) => res.status(statusCode).json(payload);

const ok = (res, { message = "OK", data = null, meta = null } = {}) =>
  send(res, 200, { ok: true, message, data, meta });

const bad = (res, message = "Bad Request", extra = {}) =>
  send(res, 400, { ok: false, message, ...extra });

const forbidden = (res, message = "Acceso denegado") =>
  send(res, 403, { ok: false, message });

const notFound = (res, message = "No encontrado") =>
  send(res, 404, { ok: false, message });

const serverError = (res, message = "Error interno", extra = {}) =>
  send(res, 500, { ok: false, message, ...extra });

// ==========================================================
// Helpers utilitarios
// ==========================================================
const safeInt = (v, def = 0) => {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : def;
};

const safeNumber = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

const safeString = (v, def = "") =>
  typeof v === "string" ? v.trim() : def;

const lower = (v) => safeString(v, "").toLowerCase();

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

const PAYOUT_STATUS = new Set([
  "pendiente",
  "procesando",
  "pagado",
  "fallido",
  "bloqueado",
]);

function validatePayoutStatusOrAll(value) {
  if (!value || value === "all") return { ok: true };

  if (!PAYOUT_STATUS.has(value)) {
    return {
      ok: false,
      message: "status inválido",
      allowed: Array.from(PAYOUT_STATUS),
    };
  }

  return { ok: true };
}

function parseSort(sort) {
  switch (sort) {
    case "monto_asc":
      return { "vendedorPayouts.monto": 1, createdAt: -1 };
    case "monto_desc":
      return { "vendedorPayouts.monto": -1, createdAt: -1 };
    case "eligibleAt_asc":
      return { payoutEligibleAt: 1, createdAt: -1 };
    case "eligibleAt_desc":
      return { payoutEligibleAt: -1, createdAt: -1 };
    case "createdAt_asc":
      return { createdAt: 1 };
    case "createdAt_desc":
    default:
      return { createdAt: -1 };
  }
}

function getUserCollectionName() {
  if (
    process.env.USER_COLLECTION &&
    String(process.env.USER_COLLECTION).trim()
  ) {
    return String(process.env.USER_COLLECTION).trim();
  }

  return "usuarios";
}

function isAdmin(req) {
  return req?.usuario?.rol === "admin";
}

function buildRetryRunId(vendedorId = null) {
  return vendedorId
    ? `admin_retry_${String(vendedorId)}_${Date.now()}`
    : `admin_retry_all_${Date.now()}`;
}

function buildRetryReason(vendedorId = null) {
  return vendedorId
    ? `admin_manual_retry_vendedor_${String(vendedorId)}`
    : "admin_manual_retry_all";
}

// ==========================================================
// GET /api/admin/payouts
// Listado paginado de payouts (un row por vendedorPayout)
// ==========================================================
exports.adminListarPayouts = async (req, res) => {
  const reqId = getRequestId(req);

  try {
    if (!isAdmin(req)) return forbidden(res);

    const page = clamp(safeInt(req.query.page, 1), 1, 100000);
    const limit = clamp(safeInt(req.query.limit, 20), 1, 100);
    const skip = (page - 1) * limit;

    const q = lower(req.query.q);
    const status = safeString(req.query.status) || "all";
    const sort = safeString(req.query.sort) || "createdAt_desc";
    const onlyEligible =
      String(req.query.onlyEligible || "").toLowerCase() === "true";
    const onlyReleased =
      String(req.query.onlyReleased || "").toLowerCase() === "true";

    const vStatus = validatePayoutStatusOrAll(status);
    if (!vStatus.ok) {
      return bad(res, vStatus.message, { allowed: vStatus.allowed });
    }

    const userCollection = getUserCollectionName();

    const matchOrden = {};

    if (onlyEligible) {
      matchOrden.payoutEligibleAt = { $ne: null, $lte: new Date() };
      matchOrden.payoutBlocked = false;
      matchOrden.estadoPago = "pagado";
      matchOrden.estadoFulfillment = "entregado";
    }

    if (onlyReleased) {
      matchOrden.payoutReleasedAt = { $ne: null };
    }

    const pipeline = [
      { $match: matchOrden },
      {
        $match: {
          vendedorPayouts: { $exists: true, $ne: [] },
        },
      },
      { $unwind: "$vendedorPayouts" },
    ];

    if (status !== "all") {
      pipeline.push({
        $match: {
          "vendedorPayouts.status": status,
        },
      });
    }

    pipeline.push(
      {
        $lookup: {
          from: userCollection,
          localField: "vendedorPayouts.vendedor",
          foreignField: "_id",
          as: "usuarioVendedor",
        },
      },
      {
        $unwind: {
          path: "$usuarioVendedor",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          vendedorNombre: { $ifNull: ["$usuarioVendedor.nombre", ""] },
          vendedorEmail: { $ifNull: ["$usuarioVendedor.email", ""] },
          ordenIdStr: { $toString: "$_id" },
          vendedorIdStr: { $toString: "$vendedorPayouts.vendedor" },
          orderNumberStr: { $toString: "$orderNumber" },
        },
      }
    );

    if (q) {
      pipeline.push({
        $match: {
          $or: [
            { vendedorNombre: { $regex: escapeRegex(q), $options: "i" } },
            { vendedorEmail: { $regex: escapeRegex(q), $options: "i" } },
            { ordenIdStr: { $regex: escapeRegex(q), $options: "i" } },
            { vendedorIdStr: { $regex: escapeRegex(q), $options: "i" } },
            { orderNumberStr: { $regex: escapeRegex(q), $options: "i" } },
            {
              "vendedorPayouts.stripeTransferId": {
                $regex: escapeRegex(q),
                $options: "i",
              },
            },
            {
              "vendedorPayouts.stripeTransferGroup": {
                $regex: escapeRegex(q),
                $options: "i",
              },
            },
          ],
        },
      });
    }

    pipeline.push(
      { $sort: parseSort(sort) },
      {
        $facet: {
          meta: [{ $count: "total" }],
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: 0,
                ordenId: "$_id",
                orderNumber: "$orderNumber",
                usuario: "$usuario",
                estadoPago: "$estadoPago",
                estadoFulfillment: "$estadoFulfillment",
                payoutPolicy: "$payoutPolicy",
                payoutEligibleAt: "$payoutEligibleAt",
                payoutReleasedAt: "$payoutReleasedAt",
                payoutBlocked: "$payoutBlocked",
                payoutBlockedReason: "$payoutBlockedReason",
                moneda: "$moneda",
                createdAt: "$createdAt",
                updatedAt: "$updatedAt",

                vendedor: {
                  _id: "$vendedorPayouts.vendedor",
                  nombre: "$vendedorNombre",
                  email: "$vendedorEmail",
                },

                payout: {
                  monto: "$vendedorPayouts.monto",
                  status: "$vendedorPayouts.status",
                  stripeAccountId: "$vendedorPayouts.stripeAccountId",
                  stripeTransferId: "$vendedorPayouts.stripeTransferId",
                  stripeTransferGroup: "$vendedorPayouts.stripeTransferGroup",
                  processingAt: "$vendedorPayouts.processingAt",
                  paidAt: "$vendedorPayouts.paidAt",
                  failedAt: "$vendedorPayouts.failedAt",
                  meta: "$vendedorPayouts.meta",
                },
              },
            },
          ],
        },
      }
    );

    const agg = await Orden.aggregate(pipeline);
    const total = agg?.[0]?.meta?.[0]?.total || 0;
    const rows = agg?.[0]?.data || [];

    return ok(res, {
      message: "Payouts (admin)",
      data: rows,
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
        reqId,
      },
    });
  } catch (err) {
    log("error", "adminListarPayouts error", {
      reqId,
      err: err?.message || String(err),
    });

    return serverError(res, "Error interno listando payouts", { reqId });
  }
};

// ==========================================================
// GET /api/admin/payouts/metrics
// Métricas resumidas de payouts
// ==========================================================
exports.adminPayoutMetrics = async (req, res) => {
  const reqId = getRequestId(req);

  try {
    if (!isAdmin(req)) return forbidden(res);

    const pipeline = [
      {
        $match: {
          vendedorPayouts: { $exists: true, $ne: [] },
        },
      },
      { $unwind: "$vendedorPayouts" },
      {
        $group: {
          _id: null,
          totalRows: { $sum: 1 },
          totalMonto: { $sum: "$vendedorPayouts.monto" },

          pendientes: {
            $sum: {
              $cond: [{ $eq: ["$vendedorPayouts.status", "pendiente"] }, 1, 0],
            },
          },
          procesando: {
            $sum: {
              $cond: [{ $eq: ["$vendedorPayouts.status", "procesando"] }, 1, 0],
            },
          },
          pagados: {
            $sum: {
              $cond: [{ $eq: ["$vendedorPayouts.status", "pagado"] }, 1, 0],
            },
          },
          fallidos: {
            $sum: {
              $cond: [{ $eq: ["$vendedorPayouts.status", "fallido"] }, 1, 0],
            },
          },
          bloqueados: {
            $sum: {
              $cond: [{ $eq: ["$vendedorPayouts.status", "bloqueado"] }, 1, 0],
            },
          },

          totalPendienteMonto: {
            $sum: {
              $cond: [
                { $eq: ["$vendedorPayouts.status", "pendiente"] },
                "$vendedorPayouts.monto",
                0,
              ],
            },
          },
          totalPagadoMonto: {
            $sum: {
              $cond: [
                { $eq: ["$vendedorPayouts.status", "pagado"] },
                "$vendedorPayouts.monto",
                0,
              ],
            },
          },
          totalFallidoMonto: {
            $sum: {
              $cond: [
                { $eq: ["$vendedorPayouts.status", "fallido"] },
                "$vendedorPayouts.monto",
                0,
              ],
            },
          },
          totalBloqueadoMonto: {
            $sum: {
              $cond: [
                { $eq: ["$vendedorPayouts.status", "bloqueado"] },
                "$vendedorPayouts.monto",
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalRows: 1,
          totalMonto: 1,
          pendientes: 1,
          procesando: 1,
          pagados: 1,
          fallidos: 1,
          bloqueados: 1,
          totalPendienteMonto: 1,
          totalPagadoMonto: 1,
          totalFallidoMonto: 1,
          totalBloqueadoMonto: 1,
        },
      },
    ];

    const [m] = await Orden.aggregate(pipeline);

    return ok(res, {
      message: "Métricas de payouts",
      data:
        m || {
          totalRows: 0,
          totalMonto: 0,
          pendientes: 0,
          procesando: 0,
          pagados: 0,
          fallidos: 0,
          bloqueados: 0,
          totalPendienteMonto: 0,
          totalPagadoMonto: 0,
          totalFallidoMonto: 0,
          totalBloqueadoMonto: 0,
        },
      meta: { reqId },
    });
  } catch (err) {
    log("error", "adminPayoutMetrics error", {
      reqId,
      err: err?.message || String(err),
    });

    return serverError(res, "Error interno en métricas de payouts", { reqId });
  }
};

// ==========================================================
// GET /api/admin/payouts/:ordenId
// Devuelve detalle de payouts por orden
// ==========================================================
exports.adminObtenerPayoutsDeOrden = async (req, res) => {
  const reqId = getRequestId(req);

  try {
    if (!isAdmin(req)) return forbidden(res);

    const { ordenId } = req.params;
    if (!isObjectId(ordenId)) return bad(res, "ordenId inválido");

    const orden = await Orden.findById(ordenId)
      .populate("usuario", "nombre email rol")
      .populate("vendedorPayouts.vendedor", "nombre email rol")
      .lean();

    if (!orden) return notFound(res, "Orden no encontrada");

    return ok(res, {
      message: "Detalle de payouts por orden",
      data: {
        ordenId: orden._id,
        orderNumber: orden.orderNumber,
        estadoPago: orden.estadoPago,
        estadoFulfillment: orden.estadoFulfillment,
        payoutPolicy: orden.payoutPolicy,
        payoutEligibleAt: orden.payoutEligibleAt,
        payoutReleasedAt: orden.payoutReleasedAt,
        payoutBlocked: orden.payoutBlocked,
        payoutBlockedReason: orden.payoutBlockedReason,
        moneda: orden.moneda,
        total: orden.total,
        comisionTotal: safeNumber(orden.comisionTotal, 0),
        ingresoVendedorTotal: safeNumber(orden.ingresoVendedorTotal, 0),
        usuario: orden.usuario || null,
        vendedorPayouts: Array.isArray(orden.vendedorPayouts)
          ? orden.vendedorPayouts
          : [],
        historial: Array.isArray(orden.historial)
          ? orden.historial.slice(-50)
          : [],
      },
      meta: { reqId },
    });
  } catch (err) {
    log("error", "adminObtenerPayoutsDeOrden error", {
      reqId,
      err: err?.message || String(err),
    });

    return serverError(res, "Error interno consultando payouts de la orden", {
      reqId,
    });
  }
};

// ==========================================================
// POST /api/admin/payouts/:ordenId/retry
// Body opcional: { vendedorId?: "..." }
// Reintenta payouts fallidos/pendientes de una orden
// ==========================================================
exports.adminReintentarPayout = async (req, res) => {
  const reqId = getRequestId(req);

  try {
    if (!isAdmin(req)) return forbidden(res);

    const { ordenId } = req.params;
    const vendedorId = safeString(req.body?.vendedorId);

    if (!isObjectId(ordenId)) return bad(res, "ordenId inválido");
    if (vendedorId && !isObjectId(vendedorId)) {
      return bad(res, "vendedorId inválido");
    }

    const orden = await Orden.findById(ordenId);

    if (!orden) return notFound(res, "Orden no encontrada");

    if (!Array.isArray(orden.vendedorPayouts) || !orden.vendedorPayouts.length) {
      return bad(res, "La orden no tiene payouts de vendedor");
    }

    if (orden.payoutBlocked) {
      return bad(res, "La orden tiene payouts bloqueados", {
        payoutBlockedReason: orden.payoutBlockedReason || "",
      });
    }

    const rows = vendedorId
      ? orden.vendedorPayouts.filter(
          (x) => String(x?.vendedor) === String(vendedorId)
        )
      : orden.vendedorPayouts;

    if (!rows.length) {
      return notFound(res, "No existe payout para ese vendedor");
    }

    const retryables = rows.filter((x) =>
      ["pendiente", "fallido"].includes(safeString(x?.status))
    );

    if (!retryables.length) {
      return bad(res, "No hay payouts reintentables", {
        allowedStatuses: ["pendiente", "fallido"],
      });
    }

    const hasBlockedSelected = rows.some(
      (x) => safeString(x?.status) === "bloqueado"
    );

    if (hasBlockedSelected) {
      return bad(res, "El payout está bloqueado y no puede reintentarse");
    }

    if (typeof orden.pushHistorial === "function") {
      orden.pushHistorial("admin_payout_retry", {
        ordenId: String(orden._id),
        vendedorId: vendedorId || null,
        adminId: req.usuario?._id?.toString?.() || req.usuario?.id || null,
        reqId,
        at: new Date().toISOString(),
      });
    }

    await orden.save();

    await pagarVendedoresDeOrden({
      ordenId: String(orden._id),
      mode: "scheduler",
      runId: buildRetryRunId(vendedorId || null),
      reason: buildRetryReason(vendedorId || null),
    });

    const refreshed = await Orden.findById(ordenId)
      .populate("vendedorPayouts.vendedor", "nombre email rol")
      .lean();

    return ok(res, {
      message: "Reintento de payout ejecutado",
      data: {
        ordenId: refreshed?._id || orden._id,
        vendedorPayouts: refreshed?.vendedorPayouts || [],
      },
      meta: { reqId },
    });
  } catch (err) {
    log("error", "adminReintentarPayout error", {
      reqId,
      err: err?.message || String(err),
    });

    return serverError(res, "Error interno reintentando payout", { reqId });
  }
};