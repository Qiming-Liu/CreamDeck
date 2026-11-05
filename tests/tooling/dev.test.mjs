import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { PassThrough } from "node:stream";
import { copyRuntime, loadDevEnv, createProcessGroup, forwardSessionInput } from "../../scripts/dev.mjs";

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
