"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const http = require("node:http");
const express = require("express");

// Real router and auth middleware; only token verification and persistence are doubles.
// The isolated process object never reads credentials or changes the parent environment.
function load(relative, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", relative), "utf8"), {
    module, exports: module.exports,
    process: { env: { ALAIA_FINANCIAL_OPERATIONS_ENABLED: "false" } },
    console,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error("Unexpected dependency in disconnected test");
    },
  }, { filename: relative });
  return module.exports;
}

async function fixture(t) {
  const effects = { userReads: 0, orderReads: 0, financial: 0 };
  const gate = load("src/config/financialOperations.js", {});
  const auth = load("src/middleware/auth.js", {
    "../models/Usuario": {
      findById(id) {
        effects.userReads++;
        return { select: async () => ({ _id: id, rol: id, activo: true, tokenVersion: 0 }) };
      },
    },
    "../services/authService": {
      verificarAccessToken(token) {
        if (!["admin", "cliente", "vendedor"].includes(token)) throw new Error("Invalid synthetic token");
        return { id: token, tokenVersion: 0 };
      },
    },
    "./reconciliationLogging": { isReconciliationRequest: () => false },
    "./cookieWriteOrigin": require("../src/middleware/cookieWriteOrigin"),
  });
  const router = load("src/routes/adminAnalyticsRoutes.js", {
    express,
    "../middleware/auth": auth,
    "../models/Orden": {
      countDocuments: async () => { effects.orderReads++; return 0; },
      aggregate: async () => { effects.orderReads++; return []; },
    },
  });
  const app = express();
  // Deliberately no CORS middleware: authorization must stand alone.
  app.use(require("cookie-parser")());
  app.use(gate.financialWriteGuard);
  app.use("/api/admin/analytics", router);
  app.post("/api/stripe/checkout", (_req, res) => { effects.financial++; res.sendStatus(200); });
  const server = http.createServer(app);
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (headers = {}, method = "GET", url = "/api/admin/analytics") => new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: server.address().port, path: url, method, headers }, res => {
      let raw = "";
      res.on("data", chunk => { raw += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on("error", reject);
    req.end();
  });
  return { effects, gate, request };
}

test("analytics rejects missing authentication before any persistence access", async t => {
  const h = await fixture(t);
  assert.equal((await h.request()).status, 401);
  assert.equal(h.effects.userReads, 0);
  assert.equal(h.effects.orderReads, 0);
});

test("analytics rejects invalid authentication before persistence access", async t => {
  const h = await fixture(t);
  assert.equal((await h.request({ authorization: "Bearer invalid-synthetic" })).status, 401);
  assert.equal(h.effects.userReads, 0);
  assert.equal(h.effects.orderReads, 0);
});

test("analytics rejects authenticated customers and vendors before order queries", async t => {
  const h = await fixture(t);
  for (const role of ["cliente", "vendedor"]) {
    assert.equal((await h.request({ authorization: `Bearer ${role}` })).status, 403);
  }
  assert.equal(h.effects.userReads, 2);
  assert.equal(h.effects.orderReads, 0);
});

test("analytics permits an authenticated admin and preserves the response shape", async t => {
  const h = await fixture(t);
  const result = await h.request({ authorization: "Bearer admin" });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, data: {
    ordenes: { total: 0, pagadas: 0, pendientes: 0, fallidas: 0, reembolsadas: 0 },
    ingresos: { total: 0, ganancia: 0 },
    series: { ordenesPorDia: [], ingresosPorDia: [] },
    payouts: { pendientes: 0, procesando: 0, pagados: 0, fallidos: 0, bloqueados: 0 },
  } });
  assert.equal(h.effects.orderReads, 9);
});

test("analytics authorization is independent of Origin and CORS, including cookies", async t => {
  const h = await fixture(t);
  for (const origin of [undefined, "https://untrusted.example.invalid"]) {
    const headers = origin ? { origin } : {};
    assert.equal((await h.request(headers)).status, 401);
    assert.equal((await h.request({ ...headers, cookie: "alaia_access_token=cliente" })).status, 403);
    assert.equal((await h.request({ ...headers, cookie: "alaia_access_token=admin" })).status, 200);
  }
});

test("analytics read access does not enable financial writes", async t => {
  const h = await fixture(t);
  assert.equal(h.gate.financialOperationsEnabled(), false);
  assert.equal((await h.request({ authorization: "Bearer admin" })).status, 200);
  const rejected = await h.request({ authorization: "Bearer admin" }, "POST", "/api/stripe/checkout");
  assert.equal(rejected.status, 503);
  assert.equal(rejected.body.code, "FINANCIAL_OPERATIONS_DISABLED");
  assert.equal(h.effects.financial, 0);
  assert.equal(h.gate.financialOperationsEnabled(), false);
});
