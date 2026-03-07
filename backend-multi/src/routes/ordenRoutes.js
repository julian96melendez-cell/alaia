// =====================================================
// ordenRoutes.js — Rutas de Órdenes (ENTERPRISE FINAL)
// =====================================================

const express = require("express");
const router = express.Router();

// =====================================================
// Controllers usuario
// =====================================================
const {
  crearOrden,
  obtenerMisOrdenes,
  obtenerOrdenPorId,
  obtenerOrdenPublica, // ✅ IMPORTANTE (Stripe redirect / público)
} = require("../controllers/ordenController");

// =====================================================
// Controllers admin PRO
// =====================================================
const {
  adminListarOrdenes,
  adminObtenerOrden,
  adminActualizarEstado,
  adminMetrics,
} = require("../controllers/adminOrdenController");

// =====================================================
// Controllers públicos (Timeline Amazon-like)
// =====================================================
const {
  obtenerTimelinePublico,
} = require("../controllers/ordenTimelineController");

// =====================================================
// Realtime / SSE (Tracking live)
// ⚠️ ESTE ARCHIVO TIENE QUE EXISTIR y exportar conectarOrdenStream
// =====================================================
const {
  conectarOrdenStream,
} = require("../controllers/ordenRealtimeController");

// =====================================================
// Middleware
// =====================================================
const { proteger, soloAdmin } = require("../middleware/auth");

// =====================================================
// RUTAS USUARIO
// =====================================================

// Crear una orden manual (si lo usas)
router.post("/crear", proteger, crearOrden);

// Obtener mis órdenes
router.get("/mias", proteger, obtenerMisOrdenes);

// =====================================================
// 🔥 ADMIN PRO (ENTERPRISE)
// =====================================================

// Métricas del dashboard
router.get("/admin/metrics", proteger, soloAdmin, adminMetrics);

// Listado paginado + filtros + búsqueda
router.get("/admin", proteger, soloAdmin, adminListarOrdenes);

// Detalle admin de una orden
router.get("/admin/:id", proteger, soloAdmin, adminObtenerOrden);

// Actualizar estados (admin)
router.put("/admin/:id/estado", proteger, soloAdmin, adminActualizarEstado);

// =====================================================
// 🔓 RUTAS PÚBLICAS (Stripe / Tracking)
// ⚠️ SIEMPRE ANTES DE "/:id"
// =====================================================

// ✅ STREAM REALTIME (SSE)
router.get("/public/:id/stream", conectarOrdenStream);

// ✅ Timeline público tipo Amazon
router.get("/public/:id/timeline", obtenerTimelinePublico);

// ✅ Info pública mínima (Stripe success / cancel)
router.get("/public/:id", obtenerOrdenPublica);

// =====================================================
// ⚠️ ESTA SIEMPRE VA AL FINAL ⚠️
// Ruta protegida por ID (usuarios logueados)
// =====================================================
router.get("/:id", proteger, obtenerOrdenPorId);

module.exports = router;