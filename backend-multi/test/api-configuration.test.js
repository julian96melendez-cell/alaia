"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../node_modules/typescript");
const { createReadinessHandler } = require("../src/config/readiness");
const { validateReturnUrl } = require("../src/config/returnUrls");
function config(file, env, dev) {
  const source = fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, URL, process: { env }, ...(dev === undefined ? {} : { __DEV__: dev }) });
  return exports;
}
for (const [file, variable, expo] of [["config/api.ts", "EXPO_PUBLIC_BACKEND_URL", true], ["frontend/lib/backend.ts", "NEXT_PUBLIC_BACKEND_URL", false]]) {
  test(`${variable}: explicit configuration, production failure and URL boundaries`, () => {
    const production = { NODE_ENV: "production" };
    assert.throws(() => config(file, production, false), new RegExp(variable));
    assert.throws(() => config(file, { ...production, EXPO_PUBLIC_API_URL: "https://api.fixture.test" }, false), new RegExp(variable));
    assert.throws(() => config(file, { ...production, NEXT_PUBLIC_API_URL: "https://api.fixture.test", [expo ? "NEXT_PUBLIC_BACKEND_URL" : "EXPO_PUBLIC_BACKEND_URL"]: "https://api.fixture.test" }, false), new RegExp(variable));
    for (const value of ["http://api.fixture.test", "https://localhost:3001", "https://192.168.1.2", "https://172.16.1.2", "https://api.fixture.test/api", "https://api.fixture.test?x=1", "https://user:fixture@api.fixture.test"]) {
      assert.throws(() => config(file, { ...production, [variable]: value }, false));
    }
    const api = config(file, { ...production, [variable]: "https://api.fixture.test/" }, false);
    assert.equal(api.apiUrl("/api/orders?x=1"), "https://api.fixture.test/api/orders?x=1");
    assert.throws(() => api.apiUrl("https://other.fixture.test/api"));
    assert.throws(() => api.apiUrl("//other.fixture.test/api"));
    const dev = config(file, { NODE_ENV: "development" }, expo ? true : undefined);
    assert.equal(dev.apiUrl("api/orders"), "http://localhost:3001/api/orders");
    if (expo) assert.throws(() => config(file, {}, undefined));
  });
}
test("readiness observes disconnects and reconnects", () => {
  const connection = { readyState: 1 };
  const handler = createReadinessHandler(connection);
  for (const state of [1, 0, 2, 3, 1]) {
    connection.readyState = state;
    const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    handler({}, response);
    assert.equal(response.code, state === 1 ? 200 : 503);
    assert.equal(response.body.ok, state === 1);
  }
});
test("Stripe returns reject placeholders and unsafe production destinations", () => {
  const before = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    for (const value of ["", "https://TU-DOMINIO.com/ok", "https://example.com/ok", "http://shop.fixture.test/ok", "https://localhost/ok", "https://user:fixture@shop.fixture.test/ok"]) assert.throws(() => validateReturnUrl(value, "STRIPE_SUCCESS_URL"));
    assert.equal(validateReturnUrl("https://shop.fixture.test/ok", "STRIPE_SUCCESS_URL"), "https://shop.fixture.test/ok");
  } finally { if (before === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before; }
});
