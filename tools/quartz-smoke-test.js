const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");

let failed = false;

function check(name, ok, details = "") {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    failed = true;
    console.error(`FAIL ${name}${details ? ` - ${details}` : ""}`);
  }
}

function file(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(file(relativePath), "utf8");
}

function nodeCheck(relativePath) {
  const result = spawnSync(process.execPath, ["--check", file(relativePath)], {
    encoding: "utf8"
  });

  check(
    `syntax ${relativePath}`,
    result.status === 0,
    (result.stderr || result.stdout || "").trim()
  );
}

console.log("Quartz Launcher smoke test");
console.log("");

[
  "main.js",
  "preload.js",
  "src/renderer.js",
  "quartz-runtime/api.js",
  "tools/quartz-runtime-test.js",
  "tools/create-quartz-native-mod.js"
].forEach((relativePath) => {
  check(`exists ${relativePath}`, fs.existsSync(file(relativePath)));
  if (fs.existsSync(file(relativePath)) && relativePath.endsWith(".js")) {
    nodeCheck(relativePath);
  }
});

const html = read("src/index.html");
const renderer = read("src/renderer.js");
const preload = read("preload.js");

[
  'id="home"',
  'id="mods"',
  'id="index"',
  'id="settings"',
  'id="indexGrid"',
  'data-page="home"',
  'data-page="mods"',
  'data-page="index"',
  'data-page="settings"'
].forEach((token) => {
  check(`html token ${token}`, html.includes(token));
});

[
  "active-page",
  "showPage",
  "loadIndex",
  "loadInstalledMods",
  "installQuartzPackage",
  "uninstallQuartzPackage",
  "enableQuartzMod",
  "disableQuartzMod",
  "getQuartzRuntimeStatus"
].forEach((token) => {
  check(`renderer token ${token}`, renderer.includes(token));
});

[
  "getQuartzIndex",
  "getInstalledMods",
  "installQuartzPackage",
  "uninstallQuartzPackage",
  "enableQuartzMod",
  "disableQuartzMod",
  "getQuartzRuntimeStatus",
  "syncQuartzRuntime",
  "openQuartzRuntimeFolder",
  "openQuartzModsFolder"
].forEach((token) => {
  check(`preload exposes ${token}`, preload.includes(token));
});

const domLoadedCount = (renderer.match(/DOMContentLoaded/g) || []).length;
console.log("");
console.log(`INFO renderer.js lines: ${renderer.split(/\r?\n/).length}`);
console.log(`INFO DOMContentLoaded mentions: ${domLoadedCount}`);

if (domLoadedCount > 2) {
  failed = true;
  console.error("FAIL renderer has too many DOMContentLoaded blocks");
} else {
  console.log("PASS DOMContentLoaded count is acceptable for now");
}

console.log("");

if (failed) {
  console.error("Quartz smoke test FAILED");
  process.exit(1);
}

console.log("Quartz smoke test PASSED");
