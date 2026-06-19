const fs = require("fs");
const path = require("path");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function createQuartzAPI(context = {}) {
  const mod = context.mod || {};
  const runtimeDir = context.runtimeDir || process.cwd();
  const packageFolder = context.packageFolder || runtimeDir;

  const storageFile =
    context.storageFile ||
    path.join(runtimeDir, "storage", `${mod.id || "unknown-mod"}.json`);

  const logFn =
    typeof context.log === "function"
      ? context.log
      : (message) => console.log(`[Quartz] ${message}`);

  function resolvePackagePath(relativePath = ".") {
    const base = path.resolve(packageFolder);
    const target = path.resolve(base, relativePath);

    if (!target.startsWith(base)) {
      throw new Error(`Blocked unsafe package path: ${relativePath}`);
    }

    return target;
  }

  const quartz = {
    apiVersion: "0.1-test",

    mod,

    paths: {
      runtimeDir,
      packageFolder,
      storageFile
    },

    log(message) {
      logFn(String(message));
    },

    storage: {
      get(key, fallback = null) {
        const data = readJson(storageFile, {});
        return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : fallback;
      },

      set(key, value) {
        const data = readJson(storageFile, {});
        data[key] = value;
        writeJson(storageFile, data);
        return value;
      },

      delete(key) {
        const data = readJson(storageFile, {});
        const existed = Object.prototype.hasOwnProperty.call(data, key);
        delete data[key];
        writeJson(storageFile, data);
        return existed;
      },

      all() {
        return readJson(storageFile, {});
      }
    },

    files: {
      exists(relativePath) {
        return fs.existsSync(resolvePackagePath(relativePath));
      },

      readText(relativePath) {
        return fs.readFileSync(resolvePackagePath(relativePath), "utf8");
      },

      list(relativePath = ".") {
        const target = resolvePackagePath(relativePath);
        if (!fs.existsSync(target)) return [];
        return fs.readdirSync(target);
      }
    }
  };

  return quartz;
}

module.exports = {
  createQuartzAPI
};
