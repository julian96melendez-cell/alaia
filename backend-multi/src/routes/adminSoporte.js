"use strict";

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const SoporteTicket = require("../models/SoporteTicket");

function isAdmin(req) {
  return req.usuario && req.usuario.rol === "admin";
}

function ok(res, payload, status = 200) {
  return res.status(status).json(payload);
}

function isObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * =========================================
 * GET /api/admin/soporte
 * Lista tickets de soporte
 * =========================================
 */
router.get("/", async (req, res, next) => {
  try {
    if (!isAdmin(req)) {
      return ok(res, { ok: false, message: "No autorizado" }, 403);
    }

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const estado = req.query.estado;

    const filter = {};

    if (estado) {
      filter.estado = estado;
    }

    const tickets = await SoporteTicket.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("usuario", "email nombre")
      .lean();

    return ok(res, {
      ok: true,
      message: "Tickets obtenidos",
      data: tickets,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * =========================================
 * GET /api/admin/soporte/:id
 * Obtener ticket específico
 * =========================================
 */
router.get("/:id", async (req, res, next) => {
  try {
    if (!isAdmin(req)) {
      return ok(res, { ok: false, message: "No autorizado" }, 403);
    }

    const { id } = req.params;

    if (!isObjectId(id)) {
      return ok(res, { ok: false, message: "ID inválido" }, 400);
    }

    const ticket = await SoporteTicket.findById(id)
      .populate("usuario", "email nombre")
      .populate("asignadoA", "email nombre")
      .lean();

    if (!ticket) {
      return ok(res, { ok: false, message: "Ticket no encontrado" }, 404);
    }

    return ok(res, {
      ok: true,
      message: "Ticket obtenido",
      data: ticket,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * =========================================
 * PUT /api/admin/soporte/:id
 * Cambiar estado / prioridad / notas
 * =========================================
 */
router.put("/:id", async (req, res, next) => {
  try {
    if (!isAdmin(req)) {
      return ok(res, { ok: false, message: "No autorizado" }, 403);
    }

    const { id } = req.params;

    if (!isObjectId(id)) {
      return ok(res, { ok: false, message: "ID inválido" }, 400);
    }

    const { estado, prioridad, notasInternas } = req.body || {};

    const update = {};

    if (estado) update.estado = estado;
    if (prioridad) update.prioridad = prioridad;
    if (notasInternas !== undefined) update.notasInternas = notasInternas;

    const ticket = await SoporteTicket.findByIdAndUpdate(
      id,
      update,
      { new: true }
    );

    if (!ticket) {
      return ok(res, { ok: false, message: "Ticket no encontrado" }, 404);
    }

    return ok(res, {
      ok: true,
      message: "Ticket actualizado",
      data: ticket,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * =========================================
 * DELETE /api/admin/soporte/:id
 * (opcional) eliminar ticket
 * =========================================
 */
router.delete("/:id", async (req, res, next) => {
  try {
    if (!isAdmin(req)) {
      return ok(res, { ok: false, message: "No autorizado" }, 403);
    }

    const { id } = req.params;

    if (!isObjectId(id)) {
      return ok(res, { ok: false, message: "ID inválido" }, 400);
    }

    const ticket = await SoporteTicket.findByIdAndDelete(id);

    if (!ticket) {
      return ok(res, { ok: false, message: "Ticket no encontrado" }, 404);
    }

    return ok(res, {
      ok: true,
      message: "Ticket eliminado",
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;