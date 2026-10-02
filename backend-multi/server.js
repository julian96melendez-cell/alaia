"use strict";

require("dotenv").config();
require("./src/utils/safeLogging").installSafeLogging();
const { getAllowedOrigins, createOriginValidator } = require("./src/config/cors");
const { redactText } = require("./src/utils/safeLogging");
const ordenRoutes = require("./src/routes/ordenRoutes");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");
const cookieParser = require("cookie-parser");
const { isReconciliationRequest, reconciliationLogFormat, reconciliationErrorLog } = require("./src/middleware/reconciliationLogging");

const conectarDB = require("./src/config/db");
const mongoose = require("mongoose");
const { createReadinessHandler } = require("./src/config/readiness");
let workers = null;

const authRoutes = require("./src/routes/authRoutes");
const stripeRoutes = require("./src/routes/stripeRoutes");
const productosRoutes = require("./src/routes/productosRoutes");
const sellerRoutes = require("./src/routes/sellerRoutes");
const sellerProductosRoutes = require("./src/routes/sellerProductosRoutes");
const adminOrdenRoutes = require("./src/routes/adminOrdenRoutes");
const adminPayoutRoutes = require("./src/routes/adminPayoutRoutes");
const { createAdminReconciliationRouter } = require("./src/routes/adminReconciliationRoutes");
const { createReconciliationReaderLifecycle } = require("./src/services/reconciliationReaderLifecycle");
const reconciliationReader = createReconciliationReaderLifecycle();
let selectedReconciliationRouter;
const { rejectAmbiguousReconciliationQuery } = require("./src/middleware/reconciliationQueryGuard");
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

const ALLOWED_ORIGINS = getAllowedOrigins();
if (isProd && ALLOWED_ORIGINS.size === 0) {
  console.warn("No hay orígenes web autorizados; configura CORS_ALLOWED_ORIGINS o CLIENT_URL");
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
    origin: createOriginValidator(ALLOWED_ORIGINS),
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
      : "dev",
    { skip: isReconciliationRequest, stream: { write: (line) => process.stdout.write(redactText(line)) } }
  )
);

app.use(morgan(reconciliationLogFormat, {
  skip: (req) => !isReconciliationRequest(req),
  stream: { write: (line) => process.stdout.write(line) },
}));

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

// Only reconciliation rejects ambiguous raw queries before global normalization.
app.use("/api/ordenes/admin/reconciliation", rejectAmbiguousReconciliationQuery);

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

app.get("/readyz", createReadinessHandler(mongoose.connection));

// ======================================================
// ROUTES
// ======================================================
// Register before generic order parameters; reconciliation never performs financial actions.
app.use("/api/ordenes/admin/reconciliation", (req, res, next) => {
  if (!selectedReconciliationRouter) return res.status(503).json({ ok: false, code: "REVIEW_UNAVAILABLE", financialActionsAllowed: false });
  return selectedReconciliationRouter(req, res, next);
});
app.use("/api/ordenes", ordenRoutes);
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

  const reconciliationError = isReconciliationRequest(req);
  if (reconciliationError) {
    console.error(reconciliationErrorLog(req, res.headersSent ? res.statusCode : status, err));
  } else {
    console.error("GLOBAL ERROR:", {
      reqId: req.reqId,
      method: req.method,
      path: req.originalUrl,
      status,
      code: err?.code,
      message: err?.message,
      stack: isProd ? undefined : err?.stack,
    });
  }

  if (res.headersSent) {
    // Avoid Express' default finalhandler logging an arbitrary error/stack.
    if (reconciliationError) return res.destroy();
    return next(err);
  }

  const message =
    status === 429
      ? "Too many requests"
      : status === 403 && err?.message?.includes?.("Origin no permitido por CORS")
      ? "Origen no permitido por CORS"
      : isProd || reconciliationError
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
let shutdownExitCode = 0;

function gracefulShutdown(signal, exitCode = 0) {
  // A later startup/cleanup failure must upgrade an already-started shutdown.
  if (exitCode !== 0) shutdownExitCode = exitCode;
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[${signal}] Graceful shutdown started`);

  try {
    workers?.stopWorkers();
  } catch (err) {
    console.error("Error stopping workers:", err?.message || err);
  }

  let forced = false, settled = false, watchdog;
  const readerClosed = reconciliationReader.close();
  const httpClosed = server ? new Promise((resolve, reject) => {
    server.close(err => err ? reject(err) : resolve());
  }) : Promise.resolve();
  Promise.allSettled([httpClosed, readerClosed]).then(results => {
    if (forced || settled) return;
    settled = true;
    clearTimeout(watchdog);
    if (results.some(result => result.status === "rejected")) {
      console.error("Shutdown cleanup failed");
      return process.exit(1);
    }
    console.log("HTTP and reconciliation reader closed cleanly");
    process.exit(shutdownExitCode);
  });

  watchdog = setTimeout(() => {
    if (forced || settled) return;
    forced = true;
    console.error("Forced shutdown: local cleanup may remain pending; remote termination unverified");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGINT", () => gracefulShutdown("SIGINT", 0));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM", 0));

(async () => {
  try {
    await conectarDB();
    if (shuttingDown) return;
    let readerConnection;
    if (reconciliationReader.enabled) {
      const models = { orders: require("./src/models/Orden"), events: require("./src/models/WebhookEvent"), cases: require("./src/models/ReconciliationCase"), audits: require("./src/models/ReconciliationAudit") };
      readerConnection = { uri: process.env.MONGO_URI, database: mongoose.connection.name, collectionNames: Object.fromEntries(Object.entries(models).map(([key, model]) => [key, model.collection.name])) };
    }
    await reconciliationReader.initialize(readerConnection);
    if (shuttingDown) return;
    selectedReconciliationRouter = createAdminReconciliationRouter({ readHandlers: reconciliationReader.handlers() });

    // Optional workers are explicitly enabled, never prerequisites for HTTP readiness.
    if (process.env.API_WORKERS_ENABLED === "true") {
      try {
        workers = require("./src/workers");
        workers.startWorkers();
      } catch {
        console.warn("Optional workers unavailable; API continues without workers");
      }
    }

    server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 BACKEND RUNNING ON ${PORT}`);
      console.log("🌐 Allowed origins:", [...ALLOWED_ORIGINS]);
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

    process.on("unhandledRejection", (reason) => {
      console.error("UNHANDLED REJECTION:", reason);
      gracefulShutdown("unhandledRejection", 1);
    });

    process.on("uncaughtException", (error) => {
      console.error("UNCAUGHT EXCEPTION:", error);
      gracefulShutdown("uncaughtException", 1);
    });
  } catch (e) {
    console.error("FATAL: startup failed");
    gracefulShutdown("startup failure", 1);
  }
})();

module.exports = app;
