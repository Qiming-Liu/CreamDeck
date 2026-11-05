import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Exercise the actual patched render/update callbacks without Steam or Decky.
function menuHarness() {
  let items = [];
  let navigated;
  class Inner {
    render() { return { props: { children: [items] } }; }
    shouldComponentUpdate() { return true; }
  }
  const component = {
    _owner: { pendingProps: { overview: { appid: 123 } } },
    props: { children: items }, type: () => ({ type: Inner }),
  };
  class Library { render() { return component; } }
  function find(tree, predicate) {
    if (!tree || typeof tree !== "object") return undefined;
    if (predicate(tree)) return tree;
    for (const child of Array.isArray(tree) ? tree : [tree.props, tree.children]) {
      const result = find(child, predicate);
      if (result) return result;
    }
  }
  const ui = {
    findModuleByExport: () => ({ factory: function () { /* navigator: */ } }),
    fakeRenderComponent: () => ({ type: Library }),
    findInReactTree: find, findInTree: find,
    Navigation: { Navigate: (route) => { navigated = route; } },
    afterPatch(target, key, callback) {
      const original = target[key];
      target[key] = function (...args) { return callback(args, original.apply(this, args)); };
      return { unpatch() { target[key] = original; } };
    },
  };
  const source = readFileSync(new URL("../../src/patch.tsx", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    module, exports: module.exports,
    require(name) {
      if (name === "@decky/ui") return ui;
      if (name === "react/jsx-runtime") return { jsx: (type, props, key) => ({ type, props, key }) };
      return { menuItemLabel: () => "GCM", gamePageRoute: (id) => `/gcm/${id}` };
    },
  });
  // Support both plugins' public patch installation APIs.
  const cleanup = module.exports.LibraryContextMenu
    ? module.exports.default(Library).unpatch : module.exports.default();
  new Library().render();
  component.type();
  return {
    cleanup,
    route: () => navigated,
    render(next) { items = next; new Inner().render(); },
    refresh(next) { new Inner().shouldComponentUpdate({ children: next }); },
    outer(next) { component.props.children = next; new Library().render(); },
    renderType() { component.type(); },
  };
}

const launch = () => ({ props: { onSelected: function () { return "launchSource"; } } });
const properties = () => ({ props: { onSelected: function () { return "AppProperties"; } } });
const isPlugin = (item) => ["creamdeck", "game-cheats-manager"].includes(item?.key);

test("cleanup removes nested hooks after repeated menu renders", () => {
  const h = menuHarness();
  h.renderType();
  h.renderType();
  h.cleanup();
  for (const path of ["render", "refresh", "outer"]) {
    const items = [launch(), properties()];
    h[path](items);
    assert.equal(items.filter(isPlugin).length, 0, path);
  }
});

for (const path of ["render", "refresh", "outer"]) {
  test(`${path}: main menu keeps one working entry before Properties`, () => {
    const h = menuHarness();
    try {
      const props = properties();
      const items = [launch(), props];
      h[path](items);
      h[path](items);
      const entries = items.filter(isPlugin);
      assert.equal(entries.length, 1);
      assert.equal(items.indexOf(entries[0]), items.indexOf(props) - 1);
      entries[0].props.onSelected();
      assert.match(h.route(), /\/(creamdeck|gcm)\/123$/);
    } finally { h.cleanup(); }
  });

  test(`${path}: Manage and other submenus never receive an entry`, () => {
    const h = menuHarness();
    try {
      for (const items of [
        [{ props: { children: "Hide" } }, { props: { children: "Uninstall" } }],
        [],
      ]) {
        const before = items.slice();
        h[path](items);
        assert.deepEqual(items, before);
      }
    } finally { h.cleanup(); }
  });

  test(`${path}: Steam's nested item groups keep the main-menu entry`, () => {
    const h = menuHarness();
    try {
      const propertiesGroup = [properties()];
      const items = [[launch()], [{ props: { children: "Manage" } }], propertiesGroup];
      h[path](items);
      h[path](items);
      const entries = items.filter(isPlugin);
      assert.equal(entries.length, 1);
      assert.equal(items.indexOf(entries[0]), items.indexOf(propertiesGroup) - 1);
    } finally { h.cleanup(); }
  });

  test(`${path}: recursive lookup supports wrapped Properties items`, () => {
    const h = menuHarness();
    try {
      const wrapped = { props: { children: [properties()] } };
      const items = [launch(), wrapped];
      h[path](items);
      h[path](items);
      const entries = items.filter(isPlugin);
      assert.equal(entries.length, 1);
      assert.equal(items.indexOf(entries[0]), items.indexOf(wrapped) - 1);
    } finally { h.cleanup(); }
  });
}
