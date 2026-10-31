import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../../src/utils/wineDllOverride.ts", import.meta.url), "utf8");
const parserSource = fs.readFileSync(new URL("../../src/domain/launchOptionsParser.ts", import.meta.url), "utf8");
const parserOutput = ts.transpileModule(parserSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const parserUrl = `data:text/javascript;base64,${Buffer.from(parserOutput).toString("base64")}`;
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { getAppLaunchOptions, mergeWineDllOverride, inspectWineDllOverride, editWineDllOverride, setWineDllOverride } = await import(`data:text/javascript;base64,${Buffer.from(outputText.replace("../domain/launchOptionsParser", parserUrl)).toString("base64")}`);

test("an immediate Steam callback resolves and unregisters its listener", async t => {
  let unregistered = 0;
  globalThis.SteamClient = { Apps: { RegisterForAppDetails: (_id, callback) => {
    callback({ strLaunchOptions: "existing option" });
    return { unregister: () => unregistered++ };
  } } };
  t.after(() => { delete globalThis.SteamClient; });
  assert.equal(await getAppLaunchOptions(10), "existing option");
  assert.equal(unregistered, 1);
});

test("a missing Steam callback times out and releases the busy action", async t => {
  let timeout;
  let unregistered = 0;
  t.mock.method(globalThis, "setTimeout", callback => { timeout = callback; return 1; });
  t.mock.method(globalThis, "clearTimeout", () => {});
  globalThis.SteamClient = { Apps: { RegisterForAppDetails: () => ({ unregister: () => unregistered++ }) } };
  t.after(() => { delete globalThis.SteamClient; });
  const pending = getAppLaunchOptions(10);
  timeout();
  assert.equal(await pending, null);
  assert.equal(unregistered, 1);
});

test("proxy launch options preserve other overrides and existing arguments", () => {
  assert.equal(mergeWineDllOverride('WINEDLLOVERRIDES="dxgi=n,b" gamemoderun %command% -flag', "version"), 'WINEDLLOVERRIDES="dxgi=n,b;version=n,b" gamemoderun %command% -flag');
});

test("the switch reads quoted, unquoted, grouped and repeated overrides", () => {
  for (const source of ['WINEDLLOVERRIDES="version=n,b" %command%', "WINEDLLOVERRIDES='version,dxgi=n,b' %command%", 'WINEDLLOVERRIDES=version=n,b %command%']) {
    assert.deepEqual(inspectWineDllOverride(source, "version"), { enabled: true, editable: true });
  }
  assert.equal(inspectWineDllOverride('WINEDLLOVERRIDES="version=n,b;version=b" %command%', "version").enabled, false);
  assert.equal(inspectWineDllOverride('WINEDLLOVERRIDES="version=n,b" WINEDLLOVERRIDES="dxgi=n,b" %command%', "version").enabled, false);
});

test("turning off the selected DLL preserves grouped names, other overrides and arguments", () => {
  assert.equal(editWineDllOverride('FOO=1 WINEDLLOVERRIDES="version,dxgi=n,b;winmm=b" gamemoderun %command% --path "my files"', "version", false), 'FOO=1 WINEDLLOVERRIDES="dxgi=n,b;winmm=b" gamemoderun %command% --path "my files"');
  assert.equal(editWineDllOverride('WINEDLLOVERRIDES="version=n,b" %command% -novid', "version", false), '%command% -novid');
});

test("turning off a repeated assignment does not reactivate an earlier one", () => {
  const result = editWineDllOverride('WINEDLLOVERRIDES="version=n,b" WINEDLLOVERRIDES="version=n,b" %command%', "version", false);
  assert.equal(result, 'WINEDLLOVERRIDES="version=n,b" WINEDLLOVERRIDES="" %command%');
  assert.equal(inspectWineDllOverride(result, "version").enabled, false);
});

test("enabling replaces conflicting rules and disabling an absent rule is a no-op", () => {
  assert.equal(editWineDllOverride('', "version", true), 'WINEDLLOVERRIDES="version=n,b" %command%');
  assert.equal(editWineDllOverride('WINEDLLOVERRIDES="version,dxgi=b" %command%', "version", true), 'WINEDLLOVERRIDES="dxgi=b;version=n,b" %command%');
  const source = 'WINEDLLOVERRIDES="version=b;dxgi=n,b" %command%';
  assert.equal(editWineDllOverride(source, "version", false), source);
});

test("complex and malformed options remain untouched instead of receiving a blind replacement", () => {
  for (const source of ['WINEDLLOVERRIDES="$OVERRIDES" %command%', 'WINEDLLOVERRIDES="version=n,b %command%', 'env WINEDLLOVERRIDES="version=n,b" %command%', '%command% && echo hello']) {
    assert.equal(inspectWineDllOverride(source, "version").editable, false);
    assert.throws(() => editWineDllOverride(source, "version", true));
  }
});

test("a switch edit reads fresh Steam settings before saving", async t => {
  const writes = [];
  let options = 'FOO=latest WINEDLLOVERRIDES="dxgi=n,b" %command%';
  globalThis.SteamClient = { Apps: {
    RegisterForAppDetails: (_id, callback) => { callback({ strLaunchOptions: options }); return { unregister() {} }; },
    SetAppLaunchOptions: (id, value) => { writes.push([id, value]); options = value; },
  } };
  t.after(() => { delete globalThis.SteamClient; });
  await setWineDllOverride(10, "version", true);
  assert.deepEqual(writes, [[10, 'FOO=latest WINEDLLOVERRIDES="dxgi=n,b;version=n,b" %command%']]);
});

test("DeckyGCM sidecar and shared folders survive enabling and disabling a DLL override", () => {
  // Fixtures are real editSidecar output from the adjacent DeckyGCM checkout.
  const fixtures = JSON.parse(fs.readFileSync(new URL("../fixtures/deckygcm-launch-options.json", import.meta.url), "utf8"));
  for (const source of fixtures.flatMap(f => [f.enabled, f.disabled, f.wineFirstEnabled, f.wineFirstDisabled])) {
    const enabled = editWineDllOverride(source, "version", true);
    assert.equal(inspectWineDllOverride(enabled, "version").enabled, true);
    const removed = editWineDllOverride(enabled, "version", false);
    assert.equal(removed.trim(), source.replace('WINEDLLOVERRIDES="version=n,b" ', "").trim());
    const existing = `WINEDLLOVERRIDES="dxgi=n,b" ${source}`;
    const toggled = editWineDllOverride(editWineDllOverride(existing, "version", true), "version", false);
    assert.equal(toggled.includes('WINEDLLOVERRIDES="dxgi=n,b"'), true);
  }
});

test("an unconfirmed Steam write rejects instead of reporting readiness", async t => {
  globalThis.SteamClient = { Apps: {
    RegisterForAppDetails: (_id, callback) => { callback({ strLaunchOptions: '' }); return { unregister() {} }; },
    SetAppLaunchOptions: () => {},
  } };
  t.after(() => { delete globalThis.SteamClient; });
  await assert.rejects(() => setWineDllOverride(10, "version", true), /did not confirm/);
});

test("Steam write failures reject without reporting a successful toggle", async t => {
  globalThis.SteamClient = { Apps: {
    RegisterForAppDetails: (_id, callback) => { callback({ strLaunchOptions: '' }); return { unregister() {} }; },
    SetAppLaunchOptions: () => { throw new Error('write failed'); },
  } };
  t.after(() => { delete globalThis.SteamClient; });
  await assert.rejects(() => setWineDllOverride(10, "version", true), /write failed/);
});

test("an incomplete initial Steam detail callback is ignored", async t => {
  globalThis.SteamClient = { Apps: { RegisterForAppDetails: (_id, callback) => {
    callback({}); callback({ strLaunchOptions: '%command%' }); return { unregister() {} };
  } } };
  t.after(() => { delete globalThis.SteamClient; });
  assert.equal(await getAppLaunchOptions(10), '%command%');
});
