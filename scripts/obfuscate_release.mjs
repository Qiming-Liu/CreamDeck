import fs from "node:fs";
import { pathToFileURL } from "node:url";
import JavaScriptObfuscator from "javascript-obfuscator";

export function obfuscate(source) {
  return JavaScriptObfuscator.obfuscate(source, {
    target: "browser-no-eval",
    compact: true,
    identifierNamesGenerator: "hexadecimal",
    renameGlobals: false,
    renameProperties: false,
    stringArray: true,
    stringArrayEncoding: ["base64"],
    stringArrayThreshold: 1,
    splitStrings: true,
    splitStringsChunkLength: 12,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    selfDefending: false,
    sourceMap: false,
    seed: 314,
  }).getObfuscatedCode();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, output] = process.argv;
  fs.writeFileSync(output, obfuscate(fs.readFileSync(input, "utf8")));
}
