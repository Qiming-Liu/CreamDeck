import assert from "node:assert/strict";
import test from "node:test";
import { obfuscate } from "../../scripts/obfuscate_release.mjs";

test("release JavaScript preserves the ES module export and public property names", async () => {
  const source = 'const message = "release fixture message"; export default {name: message, calculate: (a, b) => a + b};';
  const output = obfuscate(source);
  assert(!output.includes("release fixture message"));
  assert(!output.includes("sourceMappingURL"));
  const { default: plugin } = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
  assert.equal(plugin.name, "release fixture message");
  assert.equal(plugin.calculate(2, 3), 5);
});
