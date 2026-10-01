"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { run, main } = require("../scripts/expire-checkout-reservations");

function fixture(result = { checked: 0, failed: 0 }) {
  const calls = [];
  const dependencies = {
    connect: async () => { calls.push("connect"); },
    expire: async limit => { calls.push(["expire", limit]); return result; },
    disconnect: async () => { calls.push("disconnect"); },
    log: (...args) => { calls.push(["log", ...args]); },
  };
  const state = { exitCode: 0 };
  const errors = [];
  return { calls, dependencies, state, errors, execute: () => main(dependencies, state, message => errors.push(message)) };
}

test("expiration: empty batch exits successfully and disconnects", async () => {
  const h = fixture();
  assert.deepEqual(await h.execute(), { checked: 0, failed: 0 });
  assert.equal(h.state.exitCode, 0);
  assert.deepEqual(h.calls.slice(0, 2), ["connect", ["expire", 100]]);
  assert.equal(h.calls.at(-1), "disconnect");
});

test("expiration: successful batch reports counts and exits successfully", async () => {
  const h = fixture({ checked: 3, failed: 0 });
  assert.deepEqual(await h.execute(), { checked: 3, failed: 0 });
  assert.equal(h.state.exitCode, 0);
  assert.ok(h.calls.some(call => Array.isArray(call) && call[0] === "log" && call[2] === 3 && call[4] === 0));
});

test("expiration: partial failure exits nonzero without undoing successful work", async () => {
  const h = fixture({ checked: 3, failed: 1 });
  await h.execute();
  assert.equal(h.state.exitCode, 1);
  assert.equal(h.calls.at(-1), "disconnect");
  assert.equal(h.errors.length, 1);
  await assert.rejects(run(h.dependencies), /partially failed/);
});

test("expiration: connection failure never runs batch, disconnects and suppresses details", async () => {
  const h = fixture();
  const sensitive = "fixture-private-connection-detail";
  h.dependencies.connect = async () => { h.calls.push("connect"); throw new Error(sensitive); };
  await h.execute();
  assert.equal(h.state.exitCode, 1);
  assert.deepEqual(h.calls, ["connect", "disconnect"]);
  assert.equal(h.errors.length, 1);
  assert.ok(!h.errors[0].includes(sensitive));
});

test("expiration: batch exception exits nonzero and disconnects", async () => {
  const h = fixture();
  h.dependencies.expire = async () => { throw new Error("fixture-driver-failure"); };
  await h.execute();
  assert.equal(h.state.exitCode, 1);
  assert.equal(h.calls.at(-1), "disconnect");
  assert.ok(!h.errors[0].includes("fixture-driver-failure"));
});

test("expiration: disconnect failure exits nonzero", async () => {
  const h = fixture();
  h.dependencies.disconnect = async () => { throw new Error("fixture-disconnect-failure"); };
  await h.execute();
  assert.equal(h.state.exitCode, 1);
});

test("expiration: real Node process exits nonzero on partial or connection failure", () => {
  for (const failure of ["partial", "connection"]) {
    const child = spawnSync(process.execPath, ["-e", `
      const { main } = require(process.argv[1]);
      void main({
        connect: async () => { if (process.argv[2] === 'connection') throw new Error('fixture-private-detail'); },
        expire: async () => ({ checked: 2, failed: 1 }),
        disconnect: async () => {},
        log: () => {},
      });
    `, require.resolve("../scripts/expire-checkout-reservations"), failure], { encoding: "utf8", timeout: 5000 });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 1);
    assert.equal(child.stdout, "");
    assert.match(child.stderr, /Expiration runner failed/);
    assert.ok(!child.stderr.includes("fixture-private-detail"));
  }
});

test("expiration: repeat after partial failure processes only remaining work", async () => {
  const h = fixture();
  const pending = new Set(["first", "second"]);
  const releases = [];
  let failSecond = true;
  h.dependencies.expire = async () => {
    let checked = 0; let failed = 0;
    for (const id of [...pending]) {
      checked++;
      if (id === "second" && failSecond) { failed++; continue; }
      pending.delete(id); releases.push(id);
    }
    return { checked, failed };
  };
  await h.execute();
  assert.equal(h.state.exitCode, 1);
  assert.deepEqual(releases, ["first"]);
  failSecond = false;
  const nextState = { exitCode: 0 };
  assert.deepEqual(await main(h.dependencies, nextState), { checked: 1, failed: 0 });
  assert.deepEqual(await run(h.dependencies), { checked: 0, failed: 0 });
  assert.equal(nextState.exitCode, 0);
  assert.deepEqual(releases, ["first", "second"]);
});
