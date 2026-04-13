"use strict";

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const SoporteTicket = require("../models/SoporteTicket");

function ok(res, payload, status = 200) {
  return res.status(status).json(payload);
}

function isObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * =========================================
 * POST /api/soporte
 * Crear ticket de soporte
 * =========================================
 */
router.post("/", async (req, res, next) => {
  try {
    const usuarioId = req.usuario?._id || null;

    const {
      ordenId,
      tipo = "otro",
      mensaje,
      prioridad = "media",
    } = req.body || {};

    if (!mensaje || mensaje.trim().length < 5) {
      return ok(
        res,
        {
          ok: false,
          message: "El mensaje es obligatorio.",
        },
        400
      );
    }

    if (ordenId && !isObjectId(ordenId)) {
      return ok(
        res,
        {
          ok: false,
          message: "ordenId inválido",
        },
        400
      );
    }

    const ticket = await SoporteTicket.create({
      usuario: usuarioId || null,
      usuarioEmail: req.usuario?.email || "",
      ordenId: ordenId || null,
      tipo,
      mensaje: mensaje.trim(),
      prioridad,
    });

    return ok(
      res,
      {
        ok: true,
        message: "Ticket creado correctamente",
        data: {
          ticketId: ticket._id,
          estado: ticket.estado,
        },
      },
      201
    );
  } catch (err) {
    next(err);
  }
});

/**
 * =========================================
 * GET /api/soporte/mis-tickets
 * Tickets del usuario
 * =========================================
 */
router.get("/mis-tickets", async (req, res, next) => {
  try {
    const usuarioId = req.usuario?._id;

    if (!usuarioId) {
      return ok(res, { ok: false, message: "No autenticado" }, 401);
    }

    const tickets = await SoporteTicket.find({
      usuario: usuarioId,
    })
      .sort({ createdAt: -1 })
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

module.exports = router;