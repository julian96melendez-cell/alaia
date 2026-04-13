"use strict";

const express = require("express");
const router = express.Router();

const Orden = require("../models/Orden");

// ======================================================
// GET /api/admin/analytics
// ======================================================
router.get("/", async (req, res) => {
  try {
    const now = new Date();
    const last30Days = new Date();
    last30Days.setDate(now.getDate() - 30);

    // ============================
    // Métricas globales
    // ============================
    const [
      totalOrdenes,
      ordenesPagadas,
      ordenesPendientes,
      ordenesFallidas,
      ordenesReembolsadas,
    ] = await Promise.all([
      Orden.countDocuments(),
      Orden.countDocuments({ estadoPago: "pagado" }),
      Orden.countDocuments({ estadoPago: "pendiente" }),
      Orden.countDocuments({ estadoPago: "fallido" }),
      Orden.countDocuments({
        estadoPago: { $in: ["reembolsado", "reembolsado_parcial"] },
      }),
    ]);

    // ============================
    // Ingresos / ganancias
    // ============================
    const totals = await Orden.aggregate([
      {
        $match: { estadoPago: "pagado" },
      },
      {
        $group: {
          _id: null,
          ingresosTotal: { $sum: "$total" },
          costoTotal: { $sum: "$totalCostoProveedor" },
          gananciaTotal: { $sum: "$gananciaTotal" },
        },
      },
    ]);

    const ingresosTotal = totals[0]?.ingresosTotal || 0;
    const gananciaTotal = totals[0]?.gananciaTotal || 0;

    // ============================
    // Órdenes por día (últimos 30 días)
    // ============================
    const ordenesPorDia = await Orden.aggregate([
      {
        $match: {
          createdAt: { $gte: last30Days },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          total: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
      },
    ]);

    // ============================
    // Ingresos por día (últimos 30 días)
    // ============================
    const ingresosPorDia = await Orden.aggregate([
      {
        $match: {
          estadoPago: "pagado",
          createdAt: { $gte: last30Days },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          total: { $sum: "$total" },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
      },
    ]);

    // ============================
    // Payouts (desde subdocumentos)
    // ============================
    const payoutStats = await Orden.aggregate([
      { $unwind: "$vendedorPayouts" },
      {
        $group: {
          _id: "$vendedorPayouts.status",
          count: { $sum: 1 },
          monto: { $sum: "$vendedorPayouts.monto" },
        },
      },
    ]);

    const payouts = {
      pendientes: 0,
      procesando: 0,
      pagados: 0,
      fallidos: 0,
      bloqueados: 0,
    };

    for (const p of payoutStats) {
      const key = p._id;
      if (payouts[key] !== undefined) {
        payouts[key] = p.count;
      }
    }

    // ============================
    // Respuesta final
    // ============================
    res.json({
      ok: true,
      data: {
        ordenes: {
          total: totalOrdenes,
          pagadas: ordenesPagadas,
          pendientes: ordenesPendientes,
          fallidas: ordenesFallidas,
          reembolsadas: ordenesReembolsadas,
        },

        ingresos: {
          total: ingresosTotal,
          ganancia: gananciaTotal,
        },

        series: {
          ordenesPorDia,
          ingresosPorDia,
        },

        payouts,
      },
    });
  } catch (err) {
    console.error("ADMIN ANALYTICS ERROR:", err);

    res.status(500).json({
      ok: false,
      message: "Error obteniendo analytics",
    });
  }
});

module.exports = router;