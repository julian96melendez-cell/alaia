"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { allowCookieWrite } = require("../src/middleware/cookieWriteOrigin");
const origin = "https://panel.fixture.test";
const env = { CORS_ALLOWED_ORIGINS: origin };
function response() { return { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } }; }
function auth() {
  let reads = 0;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/middleware/auth.js"), "utf8"), {
    module, exports: module.exports, process: { env }, Date, console,
    require(name) {
      if (name === "../models/Usuario") return { findById() { reads++; return { select: async () => ({ _id: "fixture", activo: true, rol: "admin" }) }; } };
      if (name === "../services/authService") return { verificarAccessToken(token) { if (token !== "fixture") throw Error("invalid"); return { id: "fixture" }; } };
      if (name === "./cookieWriteOrigin") return { allowCookieWrite: (req, res, cookie) => allowCookieWrite(req, res, cookie, env) };
      if (name === "./reconciliationLogging") return require("../src/middleware/reconciliationLogging");
      throw Error("Forbidden import");
    },
  });
  return { run: module.exports.proteger, reads: () => reads };
}
for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
  for (const [label, supplied, expected] of [["allowed", origin, 200], ["foreign", "https://evil.fixture.test", 403], ["missing", undefined, 403], ["null", "null", 403], ["path", origin + "/x", 403]]) {
    test(`${method} cookie ${label}: gate precedes database reads`, async () => {
      const h = auth(), res = response(); let next = 0;
      await h.run({ method, headers: supplied === undefined ? {} : { origin: supplied }, cookies: { alaia_access_token: "fixture" } }, res, () => next++);
      assert.equal(res.statusCode, expected);
      assert.equal(next, expected === 200 ? 1 : 0);
      assert.equal(h.reads(), next);
      if (expected === 403) assert.deepEqual(res.body, { ok: false, code: "COOKIE_WRITE_ORIGIN_FORBIDDEN", message: "Origen no permitido" });
    });
  }
}
test("absent/invalid session remains 401; GET/HEAD and selected Bearer remain usable", async () => {
  for (const [method, headers, cookies, status] of [
    ["POST", {}, {}, 401], ["POST", {}, { token: "invalid" }, 401],
    ["GET", {}, { token: "fixture" }, 200], ["HEAD", {}, { accessToken: "fixture" }, 200],
    ["POST", { authorization: "Bearer fixture" }, {}, 200],
    ["POST", { authorization: "Bearer invalid", origin }, { token: "fixture" }, 401],
    ["POST", { authorization: "Bearer fixture" }, { token: "invalid" }, 200],
  ]) {
    const h = auth(), res = response(); let next = false;
    await h.run({ method, headers, cookies }, res, () => { next = true; });
    assert.equal(res.statusCode, status); assert.equal(next, status === 200);
  }
});
test("refresh: cookie precedence cannot be bypassed with a Bearer or body token", () => {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/middleware/cookieWriteOrigin.js"), "utf8"), {
    module, process: { env }, Set, require: () => require("../src/config/cors"),
  });
  for (const [headers, cookies, expected] of [
    [{ authorization: "Bearer fixture" }, { alaia_refresh_token: "fixture" }, 403],
    [{ origin }, { alaia_refresh_token: "fixture" }, 200],
    [{}, {}, 200],
  ]) {
    let next = false; const res = response();
    module.exports.protectRefreshCookie({ method: "POST", headers, cookies, body: { refreshToken: "fixture" } }, res, () => { next = true; });
    assert.equal(res.statusCode, expected); assert.equal(next, expected === 200);
  }
});
test("empty allowlist fails closed; mobile/webhook routes keep their own authentication", () => {
  assert.equal(allowCookieWrite({ method: "POST", headers: { origin } }, response(), true, {}), false);
  const routes = fs.readFileSync(path.join(__dirname, "../src/routes/stripeRoutes.js"), "utf8");
  assert.match(routes, /router\.post\("\/payment-sheet", verificarFirebase,/);
  assert.match(routes, /router\.post\("\/checkout-intent\/cancel", verificarFirebase,/);
  assert.match(routes, /router\.post\("\/webhook", validarStripeWebhookRequest,/);
  const authRoutes = fs.readFileSync(path.join(__dirname, "../src/routes/authRoutes.js"), "utf8");
  assert.match(authRoutes, /router\.post\("\/refresh", protectRefreshCookie, validarRefresh/);
});
test("signed webhook without Origin: local Stripe signature verification stays independent of cookies", () => {
  const crypto = require("node:crypto");
  const Stripe = require("stripe");
  // SDK construction makes no request; only its local signature verifier is used.
  const stripe = new Stripe("sk_test_synthetic_unused");
  const secret = "whsec_synthetic_fixture";
  const payload = JSON.stringify({ id: "evt_fixture", type: "fixture.event", data: { object: {} } });
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const signature = `t=${timestamp},v1=${digest}`;
  const req = { method: "POST", headers: { "stripe-signature": signature }, body: Buffer.from(payload) };
  assert.equal(allowCookieWrite(req, response(), false, {}), true);
  assert.equal(stripe.webhooks.constructEvent(req.body, signature, secret).id, "evt_fixture");
  assert.throws(() => stripe.webhooks.constructEvent(req.body, signature, "whsec_wrong_fixture"));
});
