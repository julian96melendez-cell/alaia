"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../frontend/node_modules/typescript");

// Isolated hook harness for provider behavior; no DOM or external service is used.
function provider(filename, mocks, storage = new Map()) {
  const states = []; const effects = []; let cursor = 0; const pending = [];
  const React = {
    createContext: value => ({ value, Provider: "provider" }),
    createElement: (type, props) => ({ type, props }),
    useContext: context => context.value,
    useState: initial => {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useReducer: (reducer, initial) => {
      const [state, set] = React.useState(initial);
      return [state, action => set(previous => reducer(previous, action))];
    },
    useMemo: calculate => calculate(),
    useEffect: (effect, dependencies) => {
      const index = cursor++;
      if (!effects[index] || dependencies.some((value, i) => value !== effects[index].dependencies[i])) {
        effects[index]?.cleanup?.();
        effects[index] = { dependencies };
        pending.push(() => { effects[index].cleanup = effect(); });
      }
    },
  };
  const source = fs.readFileSync(path.join(__dirname, "../../frontend/context", filename), "utf8");
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const exports = {};
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  };
  vm.runInNewContext(javascript, {
    exports, window: {}, localStorage,
    require: name => {
      if (name === "react") return React;
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const component = exports.AuthProvider || exports.CartProvider;
  return {
    render: (flushEffects = true) => {
      cursor = 0;
      const value = component({ children: null }).props.value;
      if (flushEffects) while (pending.length) pending.shift()();
      return value;
    },
    unmount: () => { for (const effect of effects) effect?.cleanup?.(); },
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const buyer = { _id: "buyer-a", nombre: "A", email: "fixture@example.invalid", rol: "usuario" };

function authHarness(get) {
  let listener; let logoutOptions;
  const calls = [];
  const h = provider("AuthContext.tsx", {
    "../lib/api": { api: { get: async (url, options) => { calls.push({ url, options }); return get(); } } },
    "../lib/auth": {
      onAuthChange: callback => { listener = callback; return () => { listener = null; }; },
      logout: async options => { logoutOptions = options; listener?.(); },
    },
  });
  return { ...h, calls, notify: () => listener?.(), logoutOptions: () => logoutOptions, subscribed: () => !!listener };
}

test("web auth: backend session is the sole identity source", async () => {
  const h = authHarness(async () => ({ ok: true, data: { usuario: buyer } }));
  assert.equal(h.render().user, null);
  await tick();
  assert.equal(h.render().user._id, buyer._id);
  assert.equal(h.calls[0].url, "/api/auth/me");
  assert.equal(h.calls[0].options.autoLogoutOn401, false);
  assert.equal(h.render().loading, false);
  h.unmount(); assert.equal(h.subscribed(), false);
});

test("web auth: unavailable or rejected session leaves no authenticated user", async () => {
  for (const get of [async () => ({ ok: false }), async () => { throw new Error("offline"); }]) {
    const h = authHarness(get); h.render(); await tick();
    assert.equal(h.render().user, null); assert.equal(h.render().loading, false);
    h.unmount();
  }
});

test("web auth: older response cannot replace a newer session or update after unmount", async () => {
  const responses = [];
  const h = authHarness(() => new Promise(resolve => responses.push(resolve)));
  h.render(); h.notify();
  responses[1]({ ok: true, data: { usuario: { ...buyer, _id: "buyer-b" } } });
  await tick();
  responses[0]({ ok: true, data: { usuario: buyer } }); await tick();
  assert.equal(h.render().user._id, "buyer-b");
  h.notify(); h.unmount();
  responses[2]({ ok: true, data: { usuario: buyer } }); await tick();
  assert.equal(h.render(false).user, null);
});

test("web auth: logout uses existing cookie logout and clears identity", async () => {
  let signedIn = true;
  const h = authHarness(async () => signedIn ? { ok: true, data: { usuario: buyer } } : { ok: false });
  h.render(); await tick(); signedIn = false;
  await h.render().logout(); await tick();
  assert.equal(h.logoutOptions().redirect, false);
  assert.equal(h.render().user, null);
  h.unmount();
});

function cartHarness(storage = new Map()) {
  let auth = { user: null, loading: false };
  return { ...provider("CartContext.tsx", { "./AuthContext": { useAuth: () => auth } }, storage), setAuth: value => { auth = value; }, storage };
}
const item = { id: "product-fixture", name: "Product", price: 20, quantity: 1, stock: 3 };

test("web cart: guest add, quantity clamp, coupon and removal persist locally", async () => {
  const h = cartHarness(); h.render(); await tick();
  await h.render().addItem(item, 5);
  assert.equal(h.render().items[0].quantity, 3);
  assert.equal(h.render().subtotal, 60);
  assert.equal((await h.render().applyCoupon("bienvenido10")).ok, true);
  assert.equal(h.render().discount, 6);
  const reloaded = cartHarness(h.storage); reloaded.render(); await tick();
  assert.equal(reloaded.render().items[0].quantity, 3);
  assert.equal(reloaded.render().coupon.code, "BIENVENIDO10");
  await reloaded.render().removeItem(item.id);
  assert.equal(reloaded.render().items.length, 0);
  await reloaded.render().clearCart();
  assert.equal(reloaded.render().coupon, null);
});

test("web cart: account switches immediately hide old data and isolate guest/user carts", async () => {
  const h = cartHarness(); h.render(); await tick();
  await h.render().addItem(item);
  h.setAuth({ user: buyer, loading: false });
  const pending = h.render(); assert.equal(pending.items.length, 0);
  await assert.rejects(pending.addItem(item), /cargar/);
  await tick(); assert.equal(h.render().items.length, 0);
  await h.render().addItem({ ...item, id: "private-a" });
  const oldAccountCart = h.render();
  h.setAuth({ user: { ...buyer, _id: "buyer-b" }, loading: false });
  assert.equal(h.render().items.length, 0); await tick();
  assert.equal(h.render().items.length, 0);
  await oldAccountCart.updateQuantity("private-a", 2);
  assert.equal(h.render().items.length, 0);
  h.setAuth({ user: buyer, loading: false }); h.render(); await tick();
  assert.equal(h.render().items[0].id, "private-a");
  h.setAuth({ user: null, loading: false }); h.render(); await tick();
  assert.equal(h.render().items[0].id, item.id);
});

test("web cart: pending authentication and invalid storage cannot expose an account cart", async () => {
  const h = cartHarness(new Map([["ALAIA_GUEST_CART_V1", "invalid-json"]]));
  h.setAuth({ user: buyer, loading: true });
  assert.equal(h.render().loading, true); assert.equal(h.render().items.length, 0);
  h.setAuth({ user: null, loading: false }); h.render(); await tick();
  assert.equal(h.render().loading, false); assert.equal(h.render().items.length, 0);
});
