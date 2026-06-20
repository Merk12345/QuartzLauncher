const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "releases", "builds");
const releaseDir = path.join(root, "releases");

const version = "0.1.0-prealpha";
const appName = "QuartzLauncher";

const packagerBin = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron-packager.cmd" : "electron-packager"
);

function run(command, args, options = {}) {
  console.log("");
  console.log(`> ${command} ${args.join(" ")}`);

  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    ...options
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function rmrf(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function listBuildDirs() {
  if (!fs.existsSync(outDir)) return [];

  return fs.readdirSync(outDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function findBuildDir(keyword) {
  const dirs = listBuildDirs();
  const found = dirs.find((name) => name.toLowerCase().includes(keyword.toLowerCase()));

  if (!found) {
    console.error("");
    console.error(`Could not find build folder for: ${keyword}`);
    console.error("Available build folders:");
    for (const dir of dirs) {
      console.error(`- ${dir}`);
    }
    process.exit(1);
  }

  return found;
}

function zipFolder(folderName, zipName) {
  const folderPath = path.join(outDir, folderName);
  const zipPath = path.join(releaseDir, zipName);

  if (!fs.existsSync(folderPath)) {
    console.error(`Missing folder to zip: ${folderPath}`);
    process.exit(1);
  }

  if (fs.existsSync(zipPath)) {
    fs.rmSync(zipPath);
  }

  run("zip", ["-r", zipPath, folderName], {
    cwd: outDir
  });
}

if (!fs.existsSync(packagerBin)) {
  console.error("electron-packager was not found in node_modules.");
  console.error("Run: npm install -D @electron/packager");
  process.exit(1);
}

rmrf(outDir);
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(releaseDir, { recursive: true });

const ignoredPaths = [
  "^/.git($|/)",
  "^/.github($|/)",
  "^/backups($|/)",
  "^/checkpoints($|/)",
  "^/releases($|/)",
  "^/tmp($|/)",
  "^/dist($|/)",
  "^/out($|/)",
  "^/build-quartz($|/)",
  "^/site($|/)",
  "^/docs($|/)",
  "^/dev-packages($|/)",
  "^/templates($|/)",
  "^/\.vscode($|/)",
  "^/\.idea($|/)",
  "^/.*\\.bak$",
  "^/.*\\.backup.*$",
  "^/.*\\.broken.*$",
  "^/.*\\.log$",

  // Keep only Quartz-owned sample packages in packaged builds.
  "^/assets/packages/(?!HelloQuartz\\.quartz$|HelloQuartzNative\\.quartz$|QuartzNativeTemplate\\.quartz$|itzrealmerk\\.first-native-test\\.quartz$).*\\.quartz(\\..*)?$"
];

const commonArgs = [
  ".",
  appName,
  "--arch=x64",
  `--out=${outDir}`,
  "--overwrite",
  "--asar",
  "--prune=true",
  ...ignoredPaths.map((pattern) => `--ignore=${pattern}`)
];

run(packagerBin, [
  ...commonArgs,
  "--platform=linux"
]);

run(packagerBin, [
  ...commonArgs,
  "--platform=win32"
]);

run(packagerBin, [
  ...commonArgs,
  "--platform=darwin"
]);

console.log("");
console.log("Build folders created:");
for (const dir of listBuildDirs()) {
  console.log(`- ${dir}`);
}

const linuxDir = findBuildDir("linux");
const windowsDir = findBuildDir("win32");
const macosDir = findBuildDir("darwin");

zipFolder(linuxDir, `${appName}-linux-x64-${version}.zip`);
zipFolder(windowsDir, `${appName}-windows-x64-${version}.zip`);
zipFolder(macosDir, `${appName}-macos-x64-${version}.zip`);

console.log("");
console.log("Pre-release ZIPs created:");
console.log(path.join(releaseDir, `${appName}-linux-x64-${version}.zip`));
console.log(path.join(releaseDir, `${appName}-windows-x64-${version}.zip`));
console.log(path.join(releaseDir, `${appName}-macos-x64-${version}.zip`));
