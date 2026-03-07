// server.js — PRODUCCIÓN REAL (ENTERPRISE FINAL / MAX SAFE)
// ✅ API server limpio (NO arranca workers aquí)
// ✅ Stripe webhook mantiene RAW (stripeRoutes debe usar express.raw en la ruta webhook)
// ✅ Seguridad: helmet + rate limit + sanitize + hpp + cookies + requestId
// ✅ Error handler + 404 + timeout anti slow attack

"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");
const cookieParser = require("cookie-parser");

const conectarDB = require("./src/config/db");

const authRoutes = require("./src/routes/authRoutes");
const stripeRoutes = require("./src/routes/stripeRoutes");
const adminOrdenRoutes = require("./src/routes/adminOrdenRoutes");

const app = express();

// ======================================================
// BASICS
// ======================================================
app.disable("x-powered-by");

if (process.env.NODE_ENV === "production") {
  // necesario si estás detrás de Render/NGINX/Cloudflare
  app.set("trust proxy", 1);
}

// ======================================================
// REQUEST ID (trazabilidad)
// ======================================================
app.use((req, res, next) => {
  req.reqId =
    req.headers["x-request-id"] ||
    req.headers["x-correlation-id"] ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  res.setHeader("x-request-id", req.reqId);
  next();
});

// ======================================================
// HELMET (security headers)
// ======================================================
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "no-referrer" },
    frameguard: { action: "deny" },
    crossOriginOpenerPolicy: { policy: "same-origin" },
    contentSecurityPolicy:
      process.env.NODE_ENV === "production"
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              objectSrc: ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
  })
);

// ======================================================
// CORS (producción estricta con CLIENT_URL)
// ======================================================
const allowedOrigin =
  process.env.NODE_ENV === "production"
    ? (process.env.CLIENT_URL || "").trim()
    : true;

app.use(
  cors({
    origin: allowedOrigin || true, // si no hay CLIENT_URL, no bloquea (pero ponlo en prod)
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "stripe-signature",
      "x-request-id",
      "x-correlation-id",
    ],
  })
);

// ======================================================
// LOGGER
// ======================================================
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ======================================================
// RATE LIMIT (global + auth)
// ======================================================
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 300 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 60 : 500,
  standardHeaders: true,
  legacyHeaders: false,
});

// ======================================================
// COOKIES
// ======================================================
app.use(cookieParser());

// ======================================================
// STRIPE WEBHOOK ROUTES (RAW)
// IMPORTANTE:
// - stripeRoutes debe tener la ruta del webhook con:
//   router.post("/webhook", express.raw({ type: "application/json" }), handler)
// - Poner esto ANTES de express.json()
// ======================================================
app.use("/api/stripe", stripeRoutes);

// ======================================================
// BODY PARSERS (no afectan al webhook si webhook usa raw)
// ======================================================
app.use(
  express.json({
    limit: process.env.NODE_ENV === "production" ? "1mb" : "5mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: process.env.NODE_ENV === "production" ? "1mb" : "5mb",
  })
);

// ======================================================
// SANITIZATION (Express 4 ✅)
// ======================================================
app.use(
  mongoSanitize({
    replaceWith: "_",
  })
);

// Evita ataques por parámetros duplicados (?a=1&a=2)
app.use(
  hpp({
    whitelist: ["estadoPago", "estadoFulfillment", "sort"],
  })
);

// ======================================================
// ROUTES
// ======================================================
app.get("/", (_, res) => {
  res.send("Backend OK");
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/ordenes/admin", adminOrdenRoutes);

// ======================================================
// 404
// ======================================================
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    message: "Not found",
    reqId: req.reqId,
  });
});

// ======================================================
// ERROR HANDLER
// ======================================================
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", {
    reqId: req.reqId,
    path: req.originalUrl,
    message: err?.message,
  });

  const status = err?.status || 500;

  res.status(status).json({
    ok: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Error interno del servidor"
        : err?.message || "Error interno",
    reqId: req.reqId,
  });
});

// ======================================================
// DB + START
// ======================================================
(async () => {
  try {
    await conectarDB();

    const PORT = process.env.PORT || 3001;

    const server = app.listen(PORT, () => {
      console.log(`🚀 BACKEND RUNNING ON ${PORT}`);
    });

    // 🔒 Timeout anti slow attack
    server.setTimeout(15000);
  } catch (e) {
    console.error("FATAL: DB connection failed", e?.message || e);
    process.exit(1);
  }
})();