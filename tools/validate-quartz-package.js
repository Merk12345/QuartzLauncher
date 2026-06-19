const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const packagePath = process.argv[2];

const allowedEngines = new Set([
  "quartz-native",
  "quartz-resource",
  "geode-compat"
]);

let errors = 0;
let warnings = 0;

function error(message) {
  errors++;
  console.error(`ERROR ${message}`);
}

function warn(message) {
  warnings++;
  console.warn(`WARN  ${message}`);
}

function pass(message) {
  console.log(`PASS  ${message}`);
}

function hasFile(zip, filePath) {
  return !!zip.file(filePath);
}

async function main() {
  if (!packagePath) {
    console.error("Usage:");
    console.error("  node tools/validate-quartz-package.js <file.quartz>");
    process.exit(1);
  }

  if (!fs.existsSync(packagePath)) {
    error(`File does not exist: ${packagePath}`);
    process.exit(1);
  }

  if (path.extname(packagePath) !== ".quartz") {
    warn("File extension is not .quartz");
  } else {
    pass("File extension is .quartz");
  }

  let zip;
  try {
    const data = fs.readFileSync(packagePath);
    zip = await JSZip.loadAsync(data);
    pass("Package is a readable ZIP archive");
  } catch (err) {
    error(`Could not read ZIP archive: ${err.message}`);
    process.exit(1);
  }

  const manifestFile = zip.file("quartz.json");

  if (!manifestFile) {
    error("Missing required quartz.json");
    process.exit(1);
  }

  pass("Found quartz.json");

  let manifest;
  try {
    manifest = JSON.parse(await manifestFile.async("string"));
    pass("quartz.json is valid JSON");
  } catch (err) {
    error(`quartz.json is invalid JSON: ${err.message}`);
    process.exit(1);
  }

  const required = [
    "format",
    "formatVersion",
    "id",
    "name",
    "version",
    "engine"
  ];

  for (const key of required) {
    if (manifest[key] === undefined || manifest[key] === null || manifest[key] === "") {
      error(`Missing required field: ${key}`);
    } else {
      pass(`Required field exists: ${key}`);
    }
  }

  if (manifest.format !== "quartz.package") {
    error(`format should be quartz.package, got: ${manifest.format}`);
  } else {
    pass("format is quartz.package");
  }

  if (manifest.formatVersion !== 1) {
    warn(`formatVersion is expected to be 1, got: ${manifest.formatVersion}`);
  } else {
    pass("formatVersion is 1");
  }

  if (!allowedEngines.has(manifest.engine)) {
    error(`Invalid engine: ${manifest.engine}`);
  } else {
    pass(`Engine is valid: ${manifest.engine}`);
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(String(manifest.id || ""))) {
    error("id should only use letters, numbers, dots, underscores, and dashes");
  } else {
    pass("id format looks safe");
  }

  if (manifest.engine === "quartz-native") {
    if (!manifest.entry) {
      error("quartz-native package is missing entry");
    } else if (!hasFile(zip, manifest.entry)) {
      error(`quartz-native entry file is missing: ${manifest.entry}`);
    } else {
      pass(`quartz-native entry exists: ${manifest.entry}`);
    }
  }

  if (manifest.engine === "geode-compat") {
    const payload = manifest.payload || manifest.entry;

    if (!payload) {
      warn("geode-compat package has no payload field");
    } else if (!hasFile(zip, payload)) {
      error(`geode-compat payload file is missing: ${payload}`);
    } else {
      pass(`geode-compat payload exists: ${payload}`);
    }
  }

  if (!Array.isArray(manifest.dependencies)) {
    warn("dependencies should be an array");
  } else {
    pass("dependencies is an array");
  }

  if (!Array.isArray(manifest.permissions)) {
    warn("permissions should be an array");
  } else {
    pass("permissions is an array");
  }

  console.log("");
  console.log(`Validation finished with ${errors} error(s), ${warnings} warning(s).`);

  if (errors > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
