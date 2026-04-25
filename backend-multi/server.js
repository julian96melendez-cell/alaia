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
const productosRoutes = require("./src/routes/productosRoutes");
const sellerRoutes = require("./src/routes/sellerRoutes");
const sellerProductosRoutes = require("./src/routes/sellerProductosRoutes");
const adminOrdenRoutes = require("./src/routes/adminOrdenRoutes");
const adminPayoutRoutes = require("./src/routes/adminPayoutRoutes");
const adminAnalyticsRoutes = require("./src/routes/adminAnalyticsRoutes");

const app = express();

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

const LOCAL_DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

const ALLOWED_ORIGINS = Array.from(
  new Set([...CLIENT_URLS, ...(!isProd ? LOCAL_DEV_ORIGINS : [])])
);

if (isProd && CLIENT_URLS.length === 0) {
  console.warn("⚠️ CLIENT_URL not set in production");
}

app.disable("x-powered-by");
app.disable("etag");

if (TRUST_PROXY !== false) {
  app.set("trust proxy", TRUST_PROXY);
}

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

app.use(
  helmet({
    contentSecurityPolicy: isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            fontSrc: ["'self'", "https:", "data:"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            imgSrc: ["'self'", "data:", "https:"],
            objectSrc: ["'none'"],
            scriptSrc: ["'self'"],
            scriptSrcAttr: ["'none'"],
            styleSrc: ["'self'", "https:", "'unsafe-inline'"],
            upgradeInsecureRequests: [],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "no-referrer" },
    hsts: isProd
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      const allowed =
        ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".vercel.app");

      if (allowed) return callback(null, true);

      const err = new Error(`Origin no permitido por CORS: ${origin}`);
      err.statusCode = 403;
      return callback(err);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "stripe-signature",
      "x-request-id",
      "x-correlation-id",
      "idempotency-key",
    ],
    exposedHeaders: ["x-request-id"],
    optionsSuccessStatus: 204,
  })
);

morgan.token("reqId", (req) => req.reqId);

app.use(
  morgan(
    isProd
      ? ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" reqId=:reqId'
      : "dev"
  )
);

const limiterBaseConfig = {
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: (req, res) => {
    res.status(429).json({
      ok: false,
      message: "Too many requests, please try again later",
      reqId: req.reqId,
    });
  },
};

const globalLimiter = rateLimit({
  ...limiterBaseConfig,
  windowMs: 15 * 60 * 1000,
  max: isProd ? 300 : 2000,
  skip: (req) =>
    req.path === "/" || req.path === "/healthz" || req.path === "/readyz",
});

const authLimiter = rateLimit({
  ...limiterBaseConfig,
  windowMs: 15 * 60 * 1000,
  max: isProd ? 20 : 300,
});

app.use(globalLimiter);
app.use(cookieParser());

app.use(
  "/api/stripe/webhook",
  express.raw({
    type: "application/json",
    limit: BODY_LIMIT,
  })
);

const jsonParser = express.json({ limit: BODY_LIMIT });
const urlencodedParser = express.urlencoded({
  extended: true,
  limit: BODY_LIMIT,
});

app.use((req, res, next) => {
  if (req.originalUrl.startsWith("/api/stripe/webhook")) return next();

  jsonParser(req, res, (jsonErr) => {
    if (jsonErr) return next(jsonErr);
    urlencodedParser(req, res, next);
  });
});

app.use(
  mongoSanitize({
    replaceWith: "_",
  })
);

app.use(
  hpp({
    whitelist: [
      "estadoPago",
      "estadoFulfillment",
      "sort",
      "page",
      "limit",
      "q",
      "minTotal",
      "maxTotal",
      "from",
      "to",
      "status",
      "onlyEligible",
      "onlyReleased",
      "days",
      "activo",
      "visible",
      "categoria",
      "tipo",
      "proveedor",
      "precioMin",
      "precioMax",
      "sortBy",
      "conStock",
      "sellerType",
    ],
  })
);

app.get("/", (_req, res) => {
  res.status(200).send("Backend OK");
});

app.get("/healthz", (_req, res) => {
  res.status(200).json({
    ok: true,
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/readyz", (_req, res) => {
  res.status(200).json({
    ok: true,
    status: "ready",
    timestamp: new Date().toISOString(),
  });
});

// ======================================================
// ROUTES
// ======================================================
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/stripe", stripeRoutes);

// Ruta pública para catálogo
app.use("/api/productos", productosRoutes);

// Rutas privadas seller/admin
app.use("/api/seller/productos", sellerProductosRoutes);
app.use("/api/seller", sellerRoutes);

app.use("/api/ordenes/admin", adminOrdenRoutes);
app.use("/api/admin/payouts", adminPayoutRoutes);
app.use("/api/admin/analytics", adminAnalyticsRoutes);

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    message: "Not found",
    reqId: req.reqId,
  });
});

app.use((err, req, res, next) => {
  const status =
    Number.isInteger(err?.statusCode) &&
    err.statusCode >= 400 &&
    err.statusCode < 600
      ? err.statusCode
      : Number.isInteger(err?.status) && err.status >= 400 && err.status < 600
      ? err.status
      : err?.message?.includes?.("Origin no permitido por CORS")
      ? 403
      : 500;

  console.error("GLOBAL ERROR:", {
    reqId: req.reqId,
    method: req.method,
    path: req.originalUrl,
    status,
    code: err?.code,
    message: err?.message,
    stack: isProd ? undefined : err?.stack,
  });

  if (res.headersSent) return next(err);

  const message =
    status === 429
      ? "Too many requests"
      : status === 403 && err?.message?.includes?.("Origin no permitido por CORS")
      ? "Origen no permitido por CORS"
      : isProd
      ? "Error interno del servidor"
      : err?.message || "Error interno";

  res.status(status).json({
    ok: false,
    message,
    reqId: req.reqId,
  });
});

let server;
let shuttingDown = false;

function gracefulShutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[${signal}] Graceful shutdown started`);

  try {
    stopWorkers();
  } catch (err) {
    console.error("Error stopping workers:", err?.message || err);
  }

  if (!server) process.exit(exitCode);

  server.close((err) => {
    if (err) {
      console.error("Error closing HTTP server:", err);
      process.exit(1);
    }

    console.log("HTTP server closed");
    process.exit(exitCode);
  });

  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000).unref();
}

(async () => {
  try {
    await conectarDB();

    startWorkers();

    server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 BACKEND RUNNING ON ${PORT}`);
      console.log("🌐 Allowed origins:", ALLOWED_ORIGINS);
      console.log("🛡️ Trust proxy:", TRUST_PROXY);
    });

    server.requestTimeout = 15000;
    server.headersTimeout = 16000;
    server.keepAliveTimeout = 5000;
    server.setTimeout(15000);

    server.on("clientError", (err, socket) => {
      console.error("CLIENT ERROR:", err?.message || err);

      if (socket.writable) {
        socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      }
    });

    process.on("SIGINT", () => gracefulShutdown("SIGINT", 0));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM", 0));

    process.on("unhandledRejection", (reason) => {
      console.error("UNHANDLED REJECTION:", reason);
      gracefulShutdown("unhandledRejection", 1);
    });

    process.on("uncaughtException", (error) => {
      console.error("UNCAUGHT EXCEPTION:", error);
      gracefulShutdown("uncaughtException", 1);
    });
  } catch (e) {
    console.error("FATAL: startup failed", e?.message || e);
    process.exit(1);
  }
})();

module.exports = app;