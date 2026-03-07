// src/controllers/vendedorController.js
"use strict";

const Vendedor = require("../models/Vendedor");

// Stripe (usa tu stripeService existente si ya exporta stripe)
let stripe = null;
try {
  ({ stripe } = require("../payments/stripeService"));
} catch (_) {
  stripe = null;
}

// Utils
const ok = (res, status, payload) => res.status(status).json(payload);
const getUserId = (req) => String(req.usuario?._id || req.usuario?.id || "");
const isAdmin = (req) => req.usuario?.rol === "admin";

function mustStripe() {
  if (!stripe) {
    const err = new Error("Stripe no está configurado (stripeService no disponible)");
    err.statusCode = 500;
    throw err;
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    const err = new Error("Falta STRIPE_SECRET_KEY en .env");
    err.statusCode = 500;
    throw err;
  }
}

function env(key, def = "") {
  return (process.env[key] || def || "").trim();
}

function safeUrl(u) {
  const s = String(u || "").trim();
  return s || null;
}

/**
 * POST /api/vendedores/me
 * Crea (si no existe) el registro de vendedor para el usuario autenticado.
 * - Si eres admin, también puedes crear tu vendedor propietario (esPropietarioPlataforma)
 */
exports.crearOMiVendedor = async (req, res, next) => {
  try {
    const usuarioId = getUserId(req);
    if (!usuarioId) return ok(res, 401, { ok: false, message: "No autenticado" });

    const { tiendaNombre = "", tiendaSlug = "", telefono = "", pais = "" } = req.body || {};

    const existente = await Vendedor.findOne({ usuario: usuarioId });
    if (existente) {
      return ok(res, 200, { ok: true, message: "Vendedor ya existe", data: existente });
    }

    const vendedor = await Vendedor.create({
      usuario: usuarioId,
      tiendaNombre: String(tiendaNombre || "").trim(),
      tiendaSlug: String(tiendaSlug || "").trim(),
      telefono: String(telefono || "").trim(),
      pais: String(pais || "").trim(),
      stripeAccountType: "express",
      // si el usuario es admin y quiere ser el vendedor “propietario”:
      esPropietarioPlataforma: !!isAdmin(req) && !!req.body?.esPropietarioPlataforma,
    });

    return ok(res, 201, { ok: true, message: "Vendedor creado", data: vendedor });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/vendedores/me/stripe/onboarding
 * Crea (si falta) el stripeAccountId y devuelve un onboarding link.
 */
exports.iniciarOnboardingStripe = async (req, res, next) => {
  try {
    mustStripe();

    const usuarioId = getUserId(req);
    if (!usuarioId) return ok(res, 401, { ok: false, message: "No autenticado" });

    const vendedor = await Vendedor.findOne({ usuario: usuarioId });
    if (!vendedor) return ok(res, 404, { ok: false, message: "Vendedor no existe" });

    if (vendedor.estado === "suspendido" || vendedor.puedeVender === false) {
      return ok(res, 403, { ok: false, message: "Vendedor suspendido/bloqueado" });
    }

    // URLs de retorno (tu frontend)
    const refreshUrl =
      safeUrl(req.body?.refreshUrl) || safeUrl(env("STRIPE_ONBOARD_REFRESH_URL")) || safeUrl(env("CLIENT_URL"));
    const returnUrl =
      safeUrl(req.body?.returnUrl) || safeUrl(env("STRIPE_ONBOARD_RETURN_URL")) || safeUrl(env("CLIENT_URL"));

    if (!refreshUrl || !returnUrl) {
      return ok(res, 400, {
        ok: false,
        message:
          "Faltan URLs de onboarding. Define STRIPE_ONBOARD_REFRESH_URL y STRIPE_ONBOARD_RETURN_URL en .env (o envía refreshUrl/returnUrl).",
      });
    }

    // 1) Crear cuenta Connect si no existe
    if (!vendedor.stripeAccountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: req.usuario?.email || undefined,
        business_type: "individual",
        metadata: {
          usuarioId: String(usuarioId),
          vendedorId: String(vendedor._id),
        },
      });

      vendedor.stripeAccountId = account.id;
      vendedor.stripeAccountType = "express";
      vendedor.estado = "verificando";
      await vendedor.save();
    }

    // 2) Crear link de onboarding
    const link = await stripe.accountLinks.create({
      account: vendedor.stripeAccountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return ok(res, 200, {
      ok: true,
      message: "Onboarding Stripe iniciado",
      data: {
        stripeAccountId: vendedor.stripeAccountId,
        url: link.url,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/vendedores/me
 * Devuelve el vendedor y (opcional) refresca estado desde Stripe.
 */
exports.obtenerMiVendedor = async (req, res, next) => {
  try {
    const usuarioId = getUserId(req);
    if (!usuarioId) return ok(res, 401, { ok: false, message: "No autenticado" });

    const vendedor = await Vendedor.findOne({ usuario: usuarioId }).lean();
    if (!vendedor) return ok(res, 404, { ok: false, message: "Vendedor no existe" });

    return ok(res, 200, { ok: true, message: "Mi vendedor", data: vendedor });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/vendedores/me/stripe/sync
 * Refresca flags chargesEnabled/payoutsEnabled/detailsSubmitted desde Stripe.
 */
exports.syncStripeStatus = async (req, res, next) => {
  try {
    mustStripe();

    const usuarioId = getUserId(req);
    if (!usuarioId) return ok(res, 401, { ok: false, message: "No autenticado" });

    const vendedor = await Vendedor.findOne({ usuario: usuarioId });
    if (!vendedor) return ok(res, 404, { ok: false, message: "Vendedor no existe" });

    if (!vendedor.stripeAccountId) {
      return ok(res, 400, { ok: false, message: "Este vendedor no tiene stripeAccountId" });
    }

    const account = await stripe.accounts.retrieve(vendedor.stripeAccountId);

    vendedor.chargesEnabled = !!account.charges_enabled;
    vendedor.payoutsEnabled = !!account.payouts_enabled;
    vendedor.detailsSubmitted = !!account.details_submitted;

    // Estado app
    if (vendedor.chargesEnabled && vendedor.payoutsEnabled && vendedor.detailsSubmitted) {
      vendedor.estado = "activo";
    } else if (vendedor.estado !== "suspendido") {
      vendedor.estado = "verificando";
    }

    await vendedor.save();

    return ok(res, 200, {
      ok: true,
      message: "Stripe status sincronizado",
      data: {
        stripeAccountId: vendedor.stripeAccountId,
        estado: vendedor.estado,
        chargesEnabled: vendedor.chargesEnabled,
        payoutsEnabled: vendedor.payoutsEnabled,
        detailsSubmitted: vendedor.detailsSubmitted,
      },
    });
  } catch (err) {
    next(err);
  }
};