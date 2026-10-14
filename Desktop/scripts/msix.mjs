// Packs the built app into an MSIX for the Microsoft Store.
//
//   npm run app:build:store        the store build of the app, then this
//   node scripts/msix.mjs          this alone, over an app already built
//   node scripts/msix.mjs --layout only the folder, no package (for trying
//                                  it on this PC: see Desktop/store/README.md)
//
// The Store signs the package itself, so it leaves here unsigned. Who the
// package belongs to comes from store/identity.json, which Partner Center
// gives once the name is reserved.
//
// The tiles and icons are drawn from src-tauri/app-icon.svg, the same picture
// as the installer's icon, at every size Windows asks for. resources.pri is
// what tells Windows which of those files to use where; without it only the
// plain names count and the icons come out blurred on a sharp screen.

import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const TAURI = join(ROOT, "src-tauri");
const OUT = join(TAURI, "target", "msix");
const LAYOUT = join(OUT, "layout");
const layoutOnly = process.argv.includes("--layout");

// The image library the Branding scripts use, from the Android app's folder.
const require = createRequire(join(ROOT, "..", "MPTree-App", "node_modules", "x.js"));
const sharp = require("sharp");

const conf = JSON.parse(readFileSync(join(TAURI, "tauri.conf.json"), "utf8"));
const id = JSON.parse(readFileSync(join(ROOT, "store", "identity.json"), "utf8"));
// MSIX wants four numbers; the Store wants the last one to be 0.
const version = `${conf.version}.0`;

const exe = join(TAURI, "target", "release", "mptree-desktop.exe");
if (!existsSync(exe)) throw new Error(`No ${exe}: build the app first (npm run app:build:store).`);

/** The newest Windows SDK tool of that name. */
function sdkTool(name) {
  const bin = "C:\\Program Files (x86)\\Windows Kits\\10\\bin";
  const versions = readdirSync(bin).filter(v => /^10\./.test(v)).sort().reverse();
  for (const v of versions) {
    const p = join(bin, v, "x64", name);
    if (existsSync(p)) return p;
  }
  throw new Error(`${name} not found: install the Windows SDK.`);
}

rmSync(OUT, { recursive: true, force: true });
const ASSETS = join(LAYOUT, "Assets");
mkdirSync(ASSETS, { recursive: true });
copyFileSync(exe, join(LAYOUT, "mptree-desktop.exe"));

// ── Tiles and icons ──────────────────────────────────────────────────────────
const svg = readFileSync(join(TAURI, "app-icon.svg"));
const png = size => sharp(svg, { density: Math.max(72, Math.ceil(72 * size / 1024 * 4)) })
  .resize(size, size).png({ compressionLevel: 9 }).toBuffer();
const put = async (file, size) => writeFileSync(join(ASSETS, file), await png(size));

for (const [scale, f] of [[100, 1], [200, 2], [400, 4]]) {
  await put(`Square150x150Logo.scale-${scale}.png`, 150 * f);
  await put(`Square44x44Logo.scale-${scale}.png`, 44 * f);
  await put(`StoreLogo.scale-${scale}.png`, 50 * f);
}
// The taskbar, Start's list and Explorer ask for exact pixel sizes; the
// unplated ones are drawn as they are, without a coloured plate behind.
for (const size of [16, 24, 32, 48, 256]) {
  await put(`Square44x44Logo.targetsize-${size}.png`, size);
  await put(`Square44x44Logo.targetsize-${size}_altform-unplated.png`, size);
  await put(`Square44x44Logo.targetsize-${size}_altform-lightunplated.png`, size);
}

// ── Manifest ─────────────────────────────────────────────────────────────────
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const manifest = `<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap rescap">
  <Identity Name="${esc(id.name)}" Publisher="${esc(id.publisher)}" Version="${version}" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>MPTree</DisplayName>
    <PublisherDisplayName>${esc(id.publisherDisplayName)}</PublisherDisplayName>
    <Logo>Assets\\StoreLogo.png</Logo>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Resources>
    <Resource Language="en-us" />
    <Resource Language="nl-nl" />
    <Resource Language="es-es" />
  </Resources>
  <Applications>
    <Application Id="MPTree" Executable="mptree-desktop.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="MPTree"
        Description="An offline music player for the songs on your computer."
        BackgroundColor="transparent"
        Square150x150Logo="Assets\\Square150x150Logo.png"
        Square44x44Logo="Assets\\Square44x44Logo.png" />
    </Application>
  </Applications>
  <Capabilities>
    <Capability Name="internetClient" />
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>
`;
writeFileSync(join(LAYOUT, "AppxManifest.xml"), manifest);

// ── resources.pri ────────────────────────────────────────────────────────────
const makepri = sdkTool("makepri.exe");
const priconfig = join(OUT, "priconfig.xml");
execFileSync(makepri, ["createconfig", "/cf", priconfig, "/dq", "en-US", "/pv", "10.0.0", "/o"], { stdio: "pipe" });
execFileSync(makepri, ["new", "/pr", LAYOUT, "/cf", priconfig, "/mn", join(LAYOUT, "AppxManifest.xml"),
  "/of", join(LAYOUT, "resources.pri"), "/o"], { stdio: "pipe" });

if (layoutOnly) {
  console.log(`Layout for ${version} in ${LAYOUT}`);
} else {
  const file = join(OUT, `MPTree-${conf.version}.msix`);
  execFileSync(sdkTool("makeappx.exe"), ["pack", "/d", LAYOUT, "/p", file, "/o"], { stdio: "pipe" });
  console.log(`${file} (${version}, ${id.name})`);
}
