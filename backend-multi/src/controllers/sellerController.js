"use strict";

const Orden = require("../models/Orden");
const Producto = require("../models/Producto");
const { success, error } = require("../utils/apiResponse");

// ======================================================
// Helpers
// ======================================================
function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n) {
  return Math.round((safeNumber(n) + Number.EPSILON) * 100) / 100;
}

function getUsuarioId(req) {
  return String(req.usuario?._id || req.usuario?.id || "");
}

function isSellerApproved(usuario) {
  if (!usuario) return false;
  if (usuario.rol !== "vendedor") return false;

  // Si sellerStatus existe, exigimos approved.
  // Si aún no existe en algunos registros antiguos, permitimos acceso.
  if (
    usuario.sellerStatus !== undefined &&
    usuario.sellerStatus !== null &&
    usuario.sellerStatus !== "approved"
  ) {
    return false;
  }

  return true;
}

function getProductoSellerFilter(usuarioId) {
  return {
    $or: [
      { vendedorId: usuarioId },
      { vendedor: usuarioId },
      { sellerId: usuarioId },
    ],
  };
}

function getItemSellerId(item) {
  return String(
    item?.vendedor ||
      item?.vendedorId ||
      item?.sellerId ||
      ""
  );
}

// ======================================================
// GET /api/seller/dashboard
// ======================================================
exports.getSellerDashboard = async (req, res) => {
  try {
    const usuario = req.usuario;
    const usuarioId = getUsuarioId(req);

    if (!usuarioId) {
      return error(res, {
        statusCode: 401,
        message: "No autenticado",
      });
    }

    if (!isSellerApproved(usuario)) {
      return error(res, {
        statusCode: 403,
        message: "Acceso exclusivo para vendedores autorizados",
      });
    }

    // ======================================================
    // Consultas base
    // ======================================================
    const [totalProductos, productosActivos, ordenes] = await Promise.all([
      Producto.countDocuments({
        ...getProductoSellerFilter(usuario._id),
      }),

      Producto.countDocuments({
        ...getProductoSellerFilter(usuario._id),
        activo: true,
      }),

      Orden.find({
        $or: [
          { "items.vendedor": usuario._id },
          { "items.vendedorId": usuario._id },
          { "items.sellerId": usuario._id },
        ],
      })
        .select(
          "items estadoPago estadoFulfillment total totalComisiones totalNetoVendedores moneda createdAt updatedAt"
        )
        .lean(),
    ]);

    // ======================================================
    // Métricas calculadas
    // ======================================================
    let totalOrdenes = 0;
    let totalIngresos = 0;
    let totalPayoutsPendientes = 0;
    let totalPayoutsPagados = 0;

    let ordenesPagadas = 0;
    let ordenesPendientes = 0;
    let ordenesFallidas = 0;
    let ordenesReembolsadas = 0;

    for (const orden of ordenes) {
      const items = Array.isArray(orden?.items) ? orden.items : [];
      let tieneItemsDelVendedor = false;
      let ingresoOrden = 0;

      for (const item of items) {
        const itemSellerId = getItemSellerId(item);

        if (itemSellerId !== usuarioId) continue;

        tieneItemsDelVendedor = true;

        // Priorizamos netoVendedor, y si no existe, estimamos con subtotal
        const neto = item?.netoVendedor;
        const subtotal = item?.subtotal;
        ingresoOrden += safeNumber(
          neto !== undefined && neto !== null ? neto : subtotal,
          0
        );
      }

      if (!tieneItemsDelVendedor) continue;

      totalOrdenes += 1;
      totalIngresos += ingresoOrden;

      switch (orden?.estadoPago) {
        case "pagado":
          ordenesPagadas += 1;
          totalPayoutsPagados += 1;
          break;

        case "fallido":
          ordenesFallidas += 1;
          totalPayoutsPendientes += 1;
          break;

        case "reembolsado":
        case "reembolsado_parcial":
          ordenesReembolsadas += 1;
          totalPayoutsPendientes += 1;
          break;

        case "pendiente":
        default:
          ordenesPendientes += 1;
          totalPayoutsPendientes += 1;
          break;
      }
    }

    return success(res, {
      message: "Dashboard del vendedor obtenido correctamente",
      data: {
        totalProductos,
        productosActivos,
        totalOrdenes,
        totalIngresos: round2(totalIngresos),
        totalPayoutsPendientes,
        totalPayoutsPagados,
        ordenesPagadas,
        ordenesPendientes,
        ordenesFallidas,
        ordenesReembolsadas,
      },
    });
  } catch (err) {
    console.error("SELLER DASHBOARD ERROR:", {
      message: err?.message,
      stack: err?.stack,
    });

    return error(res, {
      statusCode: 500,
      message: "Error obteniendo dashboard del vendedor",
    });
  }
};