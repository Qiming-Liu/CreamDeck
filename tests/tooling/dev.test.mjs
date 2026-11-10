import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { PassThrough } from "node:stream";
import { copyRuntime, loadDevEnv, createProcessGroup, forwardSessionInput, fingerprint, shouldSynchronize } from "../../scripts/dev.mjs";

test("shutdown terminates background children while allowing the session to clean up", { timeout: 5000 }, async () => {
  const group = createProcessGroup();
  const session = group.spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  const heartbeat = group.spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  const sessionClosed = once(session, "close");
  const heartbeatClosed = once(heartbeat, "close");
  try {
    await Promise.all([once(session, "spawn"), once(heartbeat, "spawn")]);
    group.stop(session);
    await heartbeatClosed;
    assert.equal(session.exitCode, null);
    assert.equal(session.signalCode, null);
    assert.throws(() => group.spawn(process.execPath, []), /stopping/);
    group.stop();
    await sessionClosed;
  } finally {
    group.stop();
  }
});

test("Ctrl+C reaches the host shutdown handler and terminal raw mode is restored", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  input.isTTY = true;
  input.isRaw = false;
  const rawModes = [];
  input.setRawMode = (raw) => { input.isRaw = raw; rawModes.push(raw); };
  let stopped = 0;
  let forwarded = "";
  output.on("data", (data) => { forwarded += data.toString(); });
  const restore = forwardSessionInput(input, output, () => { stopped++; });
  input.write("sudo input\n");
  input.write(Buffer.from([3]));
  input.write(Buffer.from([3]));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(forwarded, "sudo input\n");
  assert.equal(stopped, 2);
  restore();
  assert.deepEqual(rawModes, [true, false]);
  assert.equal(input.listenerCount("data"), 0);
  assert.equal(input.isPaused(), true);
  input.destroy();
  output.destroy();
});

test("piped input ending requests shutdown without requiring a terminal", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let stopped = false;
  const restore = forwardSessionInput(input, output, () => { stopped = true; });
  input.end();
  await once(input, "end");
  assert.equal(stopped, true);
  restore();
  output.destroy();
});

test("VM payload includes unlocker binaries and excludes host credentials and caches", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "creamdeck-dev-test-"));
  try {
    const source = path.join(root, "source");
    const target = path.join(root, "target");
    const runtime = ["dist/index.js", "main.py", "package.json", "plugin.json", "py_modules/backend.py", "resources/unlocker/steam_api64.dll"];
    for (const name of [...runtime, ".env", ".decky-dev/id_ed25519", "py_modules/__pycache__/backend.pyc", "py_modules/backend.pyc"]) {
      fs.mkdirSync(path.dirname(path.join(source, name)), { recursive: true });
      fs.writeFileSync(path.join(source, name), name);
    }
    copyRuntime(source, target);
    for (const name of runtime) assert.equal(fs.readFileSync(path.join(target, name), "utf8"), name);
    for (const name of [".env", ".decky-dev", "py_modules/__pycache__", "py_modules/backend.pyc"]) assert(!fs.existsSync(path.join(target, name)));
  } finally {
    assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("process connection settings override the local ignored configuration", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "creamdeck-env-test-"));
  try {
    assert.deepEqual(loadDevEnv(root, { DECKY_HOST: "test@host" }), { DECKY_HOST: "test@host" });
    fs.writeFileSync(path.join(root, ".env"), 'DECKY_HOST="local@host"\nDECKY_PORT=2222\n');
    assert.deepEqual(loadDevEnv(root, { DECKY_HOST: "override@host" }), { DECKY_HOST: "override@host", DECKY_PORT: "2222" });
  } finally {
    assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("frontend edits settle after three seconds and backend edits after five", () => {
  const settled = { frontend: "a", backend: "a" };
  const frontend = { frontend: "b", backend: "a" };
  const backend = { frontend: "a", backend: "b" };
  const both = { frontend: "b", backend: "b" };
  const quiet = { frontend: 0, backend: 0 };
  assert.equal(shouldSynchronize(settled, settled, quiet, 10000), false);
  assert.equal(shouldSynchronize(settled, frontend, quiet, 2999), false);
  assert.equal(shouldSynchronize(settled, frontend, quiet, 3000), true);
  assert.equal(shouldSynchronize(settled, backend, quiet, 4999), false);
  assert.equal(shouldSynchronize(settled, backend, quiet, 5000), true);
  // A backend edit still settling holds back an already settled frontend edit.
  assert.equal(shouldSynchronize(settled, both, { frontend: 0, backend: 2000 }, 4000), false);
  assert.equal(shouldSynchronize(settled, both, { frontend: 0, backend: 2000 }, 7000), true);
});

test("source edits change the frontend fingerprint and Python edits the backend one", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "creamdeck-fingerprint-"));
  try {
    fs.mkdirSync(path.join(root, "src"));
    fs.mkdirSync(path.join(root, "py_modules"));
    const initial = fingerprint(root);
    fs.writeFileSync(path.join(root, "src/index.tsx"), "export {};");
    const frontend = fingerprint(root);
    assert.notEqual(frontend.frontend, initial.frontend);
    assert.equal(frontend.backend, initial.backend);
    fs.writeFileSync(path.join(root, "py_modules/backend.py"), "pass");
    const backend = fingerprint(root);
    assert.equal(backend.frontend, frontend.frontend);
    assert.notEqual(backend.backend, frontend.backend);
  } finally {
    assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
