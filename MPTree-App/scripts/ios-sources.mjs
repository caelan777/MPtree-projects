// Puts every Swift file in ios/App/App/ into the Xcode project, so a file
// written on Windows (no Xcode here) is compiled by the Mac in the iPhone
// build (.github/workflows/ios.yml). Safe to run again: files already in the
// project are left alone.
//
//   node scripts/ios-sources.mjs        (from MPTree-App/)
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

const PROJ = "ios/App/App.xcodeproj/project.pbxproj";
let s = readFileSync(PROJ, "utf8");

// Ids in the shape Xcode uses (24 hex digits), the same every run for a file.
const id = (kind, name) => createHash("md5").update(kind + ":" + name).digest("hex").slice(0, 24).toUpperCase();

// AppDelegate.swift is in the project from the template: the new files go
// next to it, in its group and its Sources build phase.
const groupLine = /^(\s*)([0-9A-F]{24} \/\* AppDelegate\.swift \*\/,)$/m;
const sourcesLine = /^(\s*)([0-9A-F]{24} \/\* AppDelegate\.swift in Sources \*\/,)$/m;
if (!groupLine.test(s) || !sourcesLine.test(s)) throw new Error("AppDelegate.swift not found in " + PROJ);

const added = [];
for (const f of readdirSync("ios/App/App").filter(f => f.endsWith(".swift")).sort()) {
  if (s.includes(`path = ${f};`) || s.includes(`path = "${f}";`)) continue;
  const ref = id("ref", f), build = id("build", f);
  s = s.replace("/* End PBXBuildFile section */",
    `\t\t${build} /* ${f} in Sources */ = {isa = PBXBuildFile; fileRef = ${ref} /* ${f} */; };\n/* End PBXBuildFile section */`);
  s = s.replace("/* End PBXFileReference section */",
    `\t\t${ref} /* ${f} */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ${f}; sourceTree = "<group>"; };\n/* End PBXFileReference section */`);
  s = s.replace(groupLine, (m, ind) => `${m}\n${ind}${ref} /* ${f} */,`);
  s = s.replace(sourcesLine, (m, ind) => `${m}\n${ind}${build} /* ${f} in Sources */,`);
  added.push(f);
}

writeFileSync(PROJ, s);
console.log(added.length ? "added " + added.join(", ") : "nothing to add");
