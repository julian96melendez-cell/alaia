"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../frontend/node_modules/typescript");
const { NextResponse } = require("../../frontend/node_modules/next/server");
const React = require("../../frontend/node_modules/react");
const { renderToStaticMarkup } = require("../../frontend/node_modules/react-dom/server");

function load(relative, allowed) {
  const source = fs.readFileSync(path.join(__dirname, "../../frontend/app", relative), "utf8");
  const exports = {};
  const imports = [];
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(code, { exports, require(name) {
    imports.push(name);
    assert.ok(Object.hasOwn(allowed, name), `Forbidden dependency: ${name}`);
    return allowed[name];
  } });
  return { exports, imports };
}

for (const [route, method] of [
  ["api/admin/usuarios/[id]/route.ts", "PUT"],
  ["api/admin/fulfillment/[id]/route.ts", "PUT"],
  ["api/admin/cupones/route.ts", "POST"],
]) {
  test(`${route}: retired handler never accesses auth, payload or storage`, async () => {
    const { exports, imports } = load(route, { "next/server": { NextResponse } });
    const forbidden = new Proxy({}, { get() { throw new Error("Request must not be read"); } });
    // Repeat with arbitrary cookie/body/context: no privileged SDK can even import.
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await exports[method](forbidden, forbidden);
      assert.equal(response.status, 410);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), {
        ok: false, code: "LEGACY_ADMIN_WRITE_DISABLED",
        message: "Función temporalmente no disponible",
      });
    }
    assert.deepEqual(imports, ["next/server"]);
    assert.deepEqual(Object.keys(exports), [method]);
  });
}

for (const section of ["usuarios", "fulfillment"]) {
  test(`${section}: unavailable screen renders without requests or write controls`, () => {
    const { exports } = load(`admin/${section}/page.tsx`, {
      "react/jsx-runtime": require("../../frontend/node_modules/react/jsx-runtime"),
    });
    const html = renderToStaticMarkup(React.createElement(exports.default));
    assert.match(html, /Función temporalmente no disponible/);
    assert.doesNotMatch(html, /<(?:button|form|input|select)\b/);
  });
}
