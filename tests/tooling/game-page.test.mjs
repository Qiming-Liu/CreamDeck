import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";

// Compile only the pure domain module, without importing Decky runtime bindings.
const source = fs.readFileSync(new URL("../../src/domain/gamePage.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { configurationForPage, selectUnlocker, proxyChoices, filterDlcs, selectVisible, sameIds } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const dlcs = [{ id: "10", name: "音乐包" }, { id: "20", name: "Season PASS" }, { id: "30", name: "Soundtrack" }];

test("filtered bulk changes preserve selections outside the visible result set", () => {
  const visible = filterDlcs(dlcs, "season", false, ["10"]);
  assert.deepEqual(selectVisible(["10"], visible, true), ["10", "20"]);
  assert.deepEqual(selectVisible(["10", "20"], visible, false), ["10"]);
});

test("DLC filtering combines names, IDs and selected-only mode", () => {
  assert.deepEqual(filterDlcs(dlcs, " 音乐 ", false, []), [dlcs[0]]);
  assert.deepEqual(filterDlcs(dlcs, "20", true, ["10"]), []);
  assert.deepEqual(filterDlcs(dlcs, "PASS", true, ["20"]), [dlcs[1]]);
});

test("switching Steam unlockers preserves valid proxy choices", () => {
  const config = { ...configurationForPage({ found: true }), proxyDll: "winhttp" };
  const cream = selectUnlocker(config, "creamapi");
  assert.equal(cream.proxyDll, "winhttp");
  assert.equal(cream.proxy, true);
  assert.deepEqual(proxyChoices(cream.unlocker), ["version", "winmm", "winhttp"]);
  assert.deepEqual(proxyChoices("unsupported"), []);
});

test("reordering selections is not an unapplied change", () => {
  assert(sameIds(["10", "20"], ["20", "10"]));
  assert(!sameIds(["10"], ["10", "20"]));
});

test("uninstalled games start with SmokeAPI and the tested version.dll proxy setup", () => {
  const config = configurationForPage({ found: true, installed: false, selected_unlocker: "creamapi", proxy_dll: "winmm", enabled_dlc_ids: ["10"] });
  assert.deepEqual(config, { unlocker: "smokeapi", proxy: true, proxyDll: "version", enabledIds: ["10"] });
});

test("defaults preserve existing direct and proxy installations", () => {
  const direct = configurationForPage({ found: true, installed: true, selected_unlocker: "creamapi", proxy_dll: null });
  assert.equal(direct.unlocker, "creamapi");
  assert.equal(direct.proxy, false);
  const proxy = configurationForPage({ found: true, installed: true, selected_unlocker: "smokeapi", proxy_dll: "winmm" });
  assert.equal(proxy.proxyDll, "winmm");
  assert.equal(proxy.proxy, true);
});
