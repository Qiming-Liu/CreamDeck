import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";

// Compile only the pure domain module, without importing Decky runtime bindings.
const source = fs.readFileSync(new URL("../../src/domain/gamePage.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { configurationForPage, selectUnlocker, proxyChoices, filterDlcs, selectVisible, sameIds, defaultSelection,
  selectionChanges, applicableIds, selectionLevel } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const display = await (async () => {
  const code = fs.readFileSync(new URL("../../src/domain/display.ts", import.meta.url), "utf8");
  const { outputText: js } = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
})();

const dlcs = [{ id: "10", name: "音乐包" }, { id: "20", name: "Season PASS" }, { id: "30", name: "Soundtrack" }];

test("filtered bulk changes preserve selections outside the visible result set", () => {
  const visible = filterDlcs(dlcs, "season", false, ["10"]);
  assert.deepEqual(selectVisible(["10"], visible, true), ["10", "20"]);
  assert.deepEqual(selectVisible(["10", "20"], visible, false), ["10"]);
});

test("DLC filtering preserves name order across search and selected-only mode", () => {
  assert.deepEqual(filterDlcs(dlcs, " 音乐 ", false, []), [dlcs[0]]);
  assert.deepEqual(filterDlcs(dlcs, "20", true, ["10"]), []);
  assert.deepEqual(filterDlcs(dlcs, "PASS", true, ["20"]), [dlcs[1]]);
  const unordered = [{ id: "1", name: "zeta" }, { id: "2", name: "Alpha 10" }, { id: "3", name: "alpha 2" }, { id: "4", name: "Beta" }];
  assert.deepEqual(filterDlcs(unordered, "", false, []).map(d => d.id), ["3", "2", "4", "1"]);
  assert.deepEqual(filterDlcs(unordered, "alpha", true, ["2", "3"]).map(d => d.id), ["3", "2"]);
  assert.deepEqual(unordered.map(d => d.id), ["1", "2", "3", "4"]);
});

test("switching Steam unlockers preserves valid proxy choices", () => {
  const config = { ...configurationForPage({ found: true }), unlocker: "smokeapi", proxy: true, proxyDll: "winhttp" };
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

test("uninstalled games start with CreamAPI and direct replacement", () => {
  const config = configurationForPage({ found: true, installed: false, selected_unlocker: "creamapi", proxy_dll: "winmm", enabled_dlc_ids: ["10"] });
  assert.deepEqual(config, { unlocker: "creamapi", proxy: false, proxyDll: "version", enabledIds: ["10"] });
});

test("defaults preserve existing direct and proxy installations", () => {
  const direct = configurationForPage({ found: true, installed: true, selected_unlocker: "creamapi", proxy_dll: null });
  assert.equal(direct.unlocker, "creamapi");
  assert.equal(direct.proxy, false);
  const proxy = configurationForPage({ found: true, installed: true, selected_unlocker: "smokeapi", proxy_dll: "winmm" });
  assert.equal(proxy.proxyDll, "winmm");
  assert.equal(proxy.proxy, true);
});

test("first-time defaults skip DLC with separate files, but a past selection is kept", () => {
  const catalog = [{ id: "1", name: "A", has_depot: true }, { id: "2", name: "B", has_depot: false }, { id: "3", name: "C", has_depot: null }];
  assert.deepEqual(defaultSelection(catalog), ["2", "3"]);
  assert.deepEqual(configurationForPage({ found: true, installed: false, dlcs: catalog }).enabledIds, ["2", "3"]);
  assert.deepEqual(configurationForPage({ found: true, installed: false, has_record: true, dlcs: catalog, enabled_dlc_ids: ["1"] }).enabledIds, ["1"]);
});

test("pending changes name toggled DLC and drop delisted IDs on apply", () => {
  const changes = selectionChanges(dlcs, ["10", "99"], ["20", "99"]);
  assert.deepEqual(changes.added.map(d => d.id), ["20"]);
  assert.deepEqual(changes.removed.map(d => d.id), ["10"]);
  assert.deepEqual(changes.delisted, ["99"]);
  assert.deepEqual(applicableIds(dlcs, ["20", "99"]), ["20"]);
});

test("the All DLC switch reflects the visible rows", () => {
  assert.equal(selectionLevel(dlcs, []), "none");
  assert.equal(selectionLevel(dlcs, ["10"]), "some");
  assert.equal(selectionLevel(dlcs, ["10", "20", "30"]), "all");
});

test("launch options highlight only this plugin's override item", () => {
  const options = 'PROTON_USE_WINED3D=1 WINEDLLOVERRIDES="version=n,b;dinput8=n,b" gamemoderun %command% -dx11';
  assert.deepEqual(display.splitOwnedOverride(options, "version"),
    ['PROTON_USE_WINED3D=1 WINEDLLOVERRIDES="', "version=n,b", ';dinput8=n,b" gamemoderun %command% -dx11']);
  assert.equal(display.splitOwnedOverride('WINEDLLOVERRIDES="xversion=n,b" %command%', "version"), null);
  assert.equal(display.splitOwnedOverride("%command% version=n,b", "version"), null);
});

test("change summaries drop the game name prefix", () => {
  assert.equal(display.shortName("Risk of Rain 2: Alloyed Collective", "Risk of Rain 2"), "Alloyed Collective");
  assert.equal(display.shortName("Risk of Rain 2 SOTS Soundtrack", "Risk of Rain 2"), "SOTS Soundtrack");
  assert.equal(display.shortName("Risk of Rain 2", "Risk of Rain 2"), "Risk of Rain 2");
  assert.equal(display.apiDll({ found: true, api_dlls: ["steam_api.dll"], targets: [{ path: ".", bitness: 32, detected: true }] }), "steam_api.dll");
});

test("the pager shows every page or a window around the current one", () => {
  assert.deepEqual(display.pageWindow(2, 1), [0, 1]);
  assert.deepEqual(display.pageWindow(20, 0), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(display.pageWindow(20, 10), [7, 8, 9, 10, 11, 12, 13]);
  assert.deepEqual(display.pageWindow(20, 19), [13, 14, 15, 16, 17, 18, 19]);
});
