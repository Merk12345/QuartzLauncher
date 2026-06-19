const fs = require("fs");
const path = require("path");
const os = require("os");

const { createQuartzAPI } = require("../quartz-runtime/api.js");

const runtimeDir = path.join(os.homedir(), ".config", "QuartzLauncher", "runtime");
const manifestPath = path.join(runtimeDir, "enabled-manifest.json");
const stagedDir = path.join(runtimeDir, "staged");
const logsDir = path.join(runtimeDir, "logs");
const logFile = path.join(logsDir, "runtime-test.log");

fs.mkdirSync(logsDir, { recursive: true });

function stamp() {
  return new Date().toISOString();
}

function log(message) {
  const line = `[${stamp()}] ${message}`;
  console.log(line);
  fs.appendFileSync(logFile, line + "\n");
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function getManifestMods(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];

  if (Array.isArray(data.mods)) return data.mods;
  if (Array.isArray(data.enabledMods)) return data.enabledMods;
  if (Array.isArray(data.enabled)) return data.enabled;
  if (Array.isArray(data.packages)) return data.packages;

  return [];
}

function getModId(mod) {
  return mod.id || mod.packageId || mod.modId || "unknown";
}

function getModName(mod) {
  return mod.name || mod.title || getModId(mod);
}

function getModEngine(mod, packageManifest) {
  return (
    mod.engine ||
    mod.type ||
    packageManifest?.engine ||
    "unknown"
  );
}

function getPackageFolder(mod) {
  const id = getModId(mod);

  const candidates = [
    path.join(stagedDir, id, "package"),
    path.join(stagedDir, id.replace(/[^a-zA-Z0-9._-]/g, "_"), "package"),
    path.join(stagedDir, id.replace(/[^a-zA-Z0-9._-]/g, "-"), "package")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

async function executeQuartzNativeMod(mod, packageFolder, packageManifest) {
  const id = getModId(mod);
  const entry = packageManifest?.entry || mod.entry || "payload/main.js";
  const entryPath = path.join(packageFolder, entry);

  if (!fs.existsSync(entryPath)) {
    log(`NATIVE ERROR: ${id} missing entry file: ${entry}`);
    return false;
  }

  try {
    delete require.cache[require.resolve(entryPath)];

    const loaded = require(entryPath);
    const activate =
      typeof loaded === "function"
        ? loaded
        : typeof loaded.activate === "function"
          ? loaded.activate
          : null;

    if (!activate) {
      log(`NATIVE ERROR: ${id} does not export activate()`);
      return false;
    }

    const quartz = createQuartzAPI({
      mod: {
        ...packageManifest,
        ...mod,
        id,
        name: getModName(mod)
      },
      runtimeDir,
      packageFolder,
      storageFile: path.join(runtimeDir, "storage", `${id}.json`),
      log: (message) => log(`NATIVE ${id}: ${message}`)
    });

    const result = await activate(quartz);

    log(`NATIVE OK: ${id} returned ${JSON.stringify(result)}`);
    return true;
  } catch (error) {
    log(`NATIVE ERROR: ${id} crashed: ${error && error.stack ? error.stack : error}`);
    return false;
  }
}

async function main() {
  fs.writeFileSync(logFile, "");

  log("Quartz Runtime Test started");
  log(`Runtime dir: ${runtimeDir}`);
  log(`Manifest: ${manifestPath}`);

  const manifest = readJson(manifestPath, null);

  if (!manifest) {
    log("ERROR: enabled-manifest.json not found or invalid.");
    process.exitCode = 1;
    return;
  }

  const mods = getManifestMods(manifest);

  log(`Enabled mods found: ${mods.length}`);

  const summary = {
    "quartz-native": 0,
    "quartz-resource": 0,
    "geode-compat": 0,
    unknown: 0
  };

  let nativeExecuted = 0;
  let nativeFailed = 0;

  for (const mod of mods) {
    const id = getModId(mod);
    const name = getModName(mod);
    const packageFolder = getPackageFolder(mod);
    const packageManifest = readJson(path.join(packageFolder, "quartz.json"), null);
    const engine = getModEngine(mod, packageManifest);

    if (Object.prototype.hasOwnProperty.call(summary, engine)) {
      summary[engine]++;
    } else {
      summary.unknown++;
    }

    const extractedOk = fs.existsSync(packageFolder);
    const packageOk = !!packageManifest || fs.existsSync(packageFolder);

    log(`${id} | ${name} | engine=${engine} | package=${packageOk ? "OK" : "MISSING"} | extracted=${extractedOk ? "OK" : "MISSING"}`);

    if (engine === "quartz-native") {
      const ok = await executeQuartzNativeMod(mod, packageFolder, packageManifest);
      if (ok) nativeExecuted++;
      else nativeFailed++;
    }
  }

  log("Runtime engine summary:");
  log(`quartz-native: ${summary["quartz-native"]}`);
  log(`quartz-resource: ${summary["quartz-resource"]}`);
  log(`geode-compat: ${summary["geode-compat"]}`);
  log(`unknown: ${summary.unknown}`);
  log(`native executed: ${nativeExecuted}`);
  log(`native failed: ${nativeFailed}`);
  log("Quartz Runtime Test completed");

  console.log("");
  console.log(`Runtime test log written to: ${logFile}`);
}

main().catch((error) => {
  log(`FATAL: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});
