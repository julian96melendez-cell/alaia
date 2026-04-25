"use strict";

require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");
const cookieParser = require("cookie-parser");

const conectarDB = require("./src/config/db");
const { startWorkers, stopWorkers } = require("./src/workers");

const authRoutes = require("./src/routes/authRoutes");
const stripeRoutes = require("./src/routes/stripeRoutes");
const sellerRoutes = require("./src/routes/sellerRoutes");
const sellerProductosRoutes = require("./src/routes/sellerProductosRoutes");
const adminOrdenRoutes = require("./src/routes/adminOrdenRoutes");
const adminPayoutRoutes = require("./src/routes/adminPayoutRoutes");
const adminAnalyticsRoutes = require("./src/routes/adminAnalyticsRoutes");

const app = express();

// ======================================================
// ENV / CONFIG
// ======================================================
const isProd = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT) || 3001;
const BODY_LIMIT = isProd ? "1mb" : "5mb";

const TRUST_PROXY = (() => {
  const raw = String(process.env.TRUST_PROXY || "").trim().toLowerCase();

  if (!raw) return isProd ? 1 : false;
  if (raw === "true") return true;
  if (raw === "false") return false;

  const asNumber = Number(raw);
  if (Number.isInteger(asNumber)) return asNumber;

  return raw;
})();

const CLIENT_URLS = String(process.env.CLIENT_URL || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const LOCAL_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const ALLOWED_ORIGINS = Array.from(
  new Set([
    ...CLIENT_URLS,
    ...(!isProd ? LOCAL_DEV_ORIGINS : []),
  ])
);

// ======================================================
// BASICS
// ======================================================
app.disable("x-powered-by");
app.disable("etag");

if (TRUST_PROXY !== false) {
  app.set("trust proxy", TRUST_PROXY);
}

// ======================================================
// REQUEST ID
// ======================================================
app.use((req, res, next) => {
  const incomingReqId =
    req.headers["x-request-id"] || req.headers["x-correlation-id"];

  req.reqId =
    typeof incomingReqId === "string" && incomingReqId.trim()
      ? incomingReqId.trim()
      : crypto.randomUUID();

  res.setHeader("x-request-id", req.reqId);
  next();
});

// ======================================================
// SECURITY
// ======================================================
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// ======================================================
// CORS
// ======================================================
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      const err = new Error(`Origin no permitido por CORS: ${origin}`);
      err.statusCode = 403;
      return callback(err);
    },
    credentials: true,
  })
);

// ======================================================
// MIDDLEWARE
// ======================================================
app.use(morgan("dev"));
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(hpp());

// ======================================================
// HEALTH
// ======================================================
app.get("/", (_req, res) => {
  res.send("Backend OK");
});

// ======================================================
// ROUTES (🔥 ORDEN CORRECTO)
// ======================================================
app.use("/api/auth", authRoutes);
app.use("/api/stripe", stripeRoutes);

// 🔥 ESTA VA PRIMERO
app.use("/api/seller/productos", sellerProductosRoutes);

// 🔥 ESTA DESPUÉS
app.use("/api/seller", sellerRoutes);

app.use("/api/ordenes/admin", adminOrdenRoutes);
app.use("/api/admin/payouts", adminPayoutRoutes);
app.use("/api/admin/analytics", adminAnalyticsRoutes);

// ======================================================
// 404
// ======================================================
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    message: "Not found",
  });
});

// ======================================================
// ERROR HANDLER
// ======================================================
app.use((err, req, res, next) => {
  console.error("ERROR:", err.message);

  res.status(err.statusCode || 500).json({
    ok: false,
    message: err.message || "Error interno",
  });
});

// ======================================================
// START
// ======================================================
let server;

(async () => {
  try {
    await conectarDB();
    startWorkers();

    server = app.listen(PORT, () => {
      console.log(`🚀 Backend running on ${PORT}`);
    });
  } catch (e) {
    console.error("FATAL:", e);
    process.exit(1);
  }
})();