import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../../src/domain/readme.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { readmeUrl, README_TRANSLATIONS } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const repository = "https://gitlab.com/alan-liu/CreamDeck";

test("the About tab opens the README in the reader's language", () => {
  assert.equal(readmeUrl(repository, "en"), `${repository}#creamdeck`);
  assert.equal(readmeUrl(repository, "zh-CN"), `${repository}/-/blob/main/README.zh-CN.md#creamdeck`);
  assert.equal(readmeUrl(repository, "zh-TW"), `${repository}/-/blob/main/README.zh-TW.md#creamdeck`);
  assert.equal(readmeUrl(repository, "ja"), `${repository}#creamdeck`);
});

test("every README a link points to exists and links to the others", () => {
  const files = ["README.md", ...Object.values(README_TRANSLATIONS)];
  for (const file of files) {
    const url = new URL(`../../${file}`, import.meta.url);
    assert.ok(fs.existsSync(url), file);
    const text = fs.readFileSync(url, "utf8").replace(/^\uFEFF/, "");
    assert.match(text, /^# CreamDeck$/m, `${file} keeps the heading the link's anchor names`);
    for (const other of files.filter(name => name !== file)) assert.ok(text.includes(`(${other})`), `${file} links to ${other}`);
  }
});
