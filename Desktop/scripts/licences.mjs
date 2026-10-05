// Collects the licence of every package that ships inside the app, for the
// "Open source licences" sheet in Settings. MIT, ISC and Apache all ask for the
// same thing: keep the notice with every copy. The app is a copy.
//
//   node scripts/licences.mjs      (the build scripts run it first)
//
// Writes src/licences.json. It is committed, so the dev server has it without
// a build; the build refreshes it, so a new dependency cannot be missed.

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

// The command line tool is a build tool: it never reaches the phone.
const SKIP = new Set(["@capacitor/cli"]);

// A package listed in package.json but imported nowhere is tree-shaken out of
// the bundle entirely, so it is not in the app and has no notice to carry.
// @capacitor/android is the exception: it ships as native code, not as an import.
const srcText = (function read(dir) {
  return readdirSync(dir, { withFileTypes: true }).map(e =>
    e.isDirectory() ? read(join(dir, e.name))
      : /\.(tsx?|jsx?)$/.test(e.name) ? readFileSync(join(dir, e.name), "utf8") : ""
  ).join("\n");
})(join(root, "src"));
const shipped = n => n === "@capacitor/android" || srcText.includes(`"${n}`) || srcText.includes(`'${n}`);

// Runtime dependencies, plus what they pull in, one level at a time. Only
// "dependencies", never dev ones, which is exactly what ends up in the bundle.
const seen = new Map();
const queue = Object.keys(pkg.dependencies ?? {}).filter(n => !SKIP.has(n) && shipped(n));
while (queue.length) {
  const name = queue.shift();
  if (seen.has(name)) continue;
  const dir = join(root, "node_modules", name);
  if (!existsSync(join(dir, "package.json"))) continue;
  const p = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const file = readdirSync(dir).find(f => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  seen.set(name, {
    name,
    version: p.version,
    licence: typeof p.license === "string" ? p.license : (p.license?.type ?? "see text"),
    text: file ? readFileSync(join(dir, file), "utf8").trim() : "",
  });
  for (const d of Object.keys(p.dependencies ?? {})) if (!SKIP.has(d)) queue.push(d);
}

// Native libraries the Android build links in, which npm knows nothing about.
const NATIVE = [
  {
    name: "AndroidX (appcompat, core, media, coordinatorlayout)",
    version: "",
    licence: "Apache-2.0",
    text: "Copyright The Android Open Source Project\n\nLicensed under the Apache License, Version 2.0 (the \"License\"); you may not use these files except in compliance with the License. You may obtain a copy of the License at\n\n    http://www.apache.org/licenses/LICENSE-2.0\n\nUnless required by applicable law or agreed to in writing, software distributed under the License is distributed on an \"AS IS\" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.",
  },
];

const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)).concat(NATIVE);
writeFileSync(join(root, "src", "licences.json"), JSON.stringify(list, null, 1) + "\n");
console.log(`licences: ${list.length} packages`);
