"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../frontend/node_modules/typescript");
const root = path.resolve(__dirname, "../..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const parse = p => ts.createSourceFile(p, read(p), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function execute(source, scope = {}) {
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  return vm.runInNewContext(output, scope);
}
function callback(file, name) {
  let found;
  const source = parse(file);
  function visit(n) {
    if (ts.isVariableDeclaration(n) && n.name.getText(source) === name) {
      found = ts.isCallExpression(n.initializer) ? n.initializer.arguments[0] : n.initializer;
    }
    ts.forEachChild(n, visit);
  }
  visit(source);
  assert.ok(found);
  return found.getText(source);
}
test("shared Firebase config initializes Auth and Firestore, never Storage", () => {
  const exports = {};
  const calls = [];
  execute(read("firebase/firebaseConfig.ts"), { exports, require(name) {
    calls.push(name);
    if (name === "@react-native-async-storage/async-storage") return {};
    if (name === "firebase/app") return { getApps: () => [], initializeApp: () => ({}) };
    if (name === "firebase/auth") return { initializeAuth: () => ({}), getReactNativePersistence: () => ({}) };
    if (name === "firebase/firestore") return { getFirestore: () => ({}) };
    throw new Error("Forbidden import");
  } });
  assert.ok(exports.auth); assert.ok(exports.db);
  assert.equal(Object.hasOwn(exports, "storage"), false);
  assert.ok(!calls.includes("firebase/storage"));
});
test("all application source has no Firebase Storage SDK imports or mutations", () => {
  let count = 0;
  function walk(dir) {
    for (const item of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (["node_modules", ".next"].includes(item.name)) continue;
      const file = path.join(dir, item.name);
      if (item.isDirectory()) walk(file);
      else if (/\.[jt]sx?$/.test(file)) {
        count++;
        const source = read(file);
        assert.doesNotMatch(source, /firebase(?:-admin)?\/storage|\b(?:getStorage|uploadBytes|uploadBytesResumable|uploadString|deleteObject|getDownloadURL)\s*\(/, file);
      }
    }
  }
  for (const dir of ["app", "context", "services", "firebase", "screens", "routes", "frontend/app", "frontend/context", "frontend/lib", "backend-multi/src"]) walk(dir);
  assert.ok(count > 50);
});
test("legacy helper rejects before URI fetch or any SDK import", async () => {
  const exports = {};
  execute(read("services/storageService.ts"), { exports, require() { throw Error("Forbidden import"); }, fetch() { throw Error("Forbidden fetch"); } });
  await assert.rejects(exports.uploadImageFromUri("file:///synthetic", "users/other/avatar.jpg"), /Función temporalmente no disponible/);
});
for (const [file, name] of [["screens/RegisterScreen.tsx", "choosePhoto"], ["screens/ProfileScreen.tsx", "pickNewPhoto"], ["screens/ProfileScreen.tsx", "onRemovePhoto"]]) {
  test(`${name}: actual legacy callback reports unavailable with no side effects`, async () => {
    const alerts = [];
    const fn = execute(`(${callback(file, name)})`, { Alert: { alert(...args) { alerts.push(args); } } });
    await fn();
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0][0], "Función temporalmente no disponible");
  });
}
test("legacy register refuses local-photo draft before creating an account", async () => {
  const alerts = [];
  let creates = 0;
  const fn = execute(`(${callback("screens/RegisterScreen.tsx", "handleRegister")})`, {
    canSubmit: true, loading: false, uploading: false, photoURL: "file:///synthetic",
    Alert: { alert(...args) { alerts.push(args); } },
    createUserWithEmailAndPassword() { creates++; throw Error("Forbidden creation"); },
  });
  await fn();
  assert.equal(creates, 0);
  assert.equal(alerts[0][0], "Función temporalmente no disponible");
});
test("legacy name edit preserves existing remote photo", async () => {
  let payload;
  const existing = "https://example.invalid/existing.jpg";
  const fn = execute(`(${callback("screens/ProfileScreen.tsx", "onSaveProfile")})`, {
    displayName: " Synthetic ", localPhoto: undefined, user: { uid: "synthetic" },
    updateUserProfile: undefined,
    auth: { currentUser: { photoURL: existing } },
    async updateProfile(_user, value) { payload = value; },
    setEditOpen() {}, setLocalPhoto() {}, Alert: { alert() {} },
  });
  await fn();
  assert.equal(payload.displayName, "Synthetic");
  assert.equal(payload.photoURL, existing);
});
