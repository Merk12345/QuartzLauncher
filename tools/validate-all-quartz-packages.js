const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const packageDirs = [
  path.join(root, "assets", "packages"),
  path.join(process.env.HOME || "", ".config", "QuartzLauncher", "packages"),
  path.join(process.env.HOME || "", ".config", "QuartzLauncher", "library"),
  path.join(process.env.HOME || "", ".config", "QuartzLauncher", "enabled")
];

function findQuartzFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];

  const found = [];

  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      found.push(...findQuartzFiles(full));
    } else if (item.endsWith(".quartz")) {
      found.push(full);
    }
  }

  return found;
}

const files = [...new Set(packageDirs.flatMap(findQuartzFiles))].sort();

console.log(`Found ${files.length} .quartz package(s).`);
console.log("");

if (files.length === 0) {
  console.log("No .quartz packages found.");
  process.exit(0);
}

let failed = 0;

for (const file of files) {
  console.log("============================================================");
  console.log(file);
  console.log("============================================================");

  const result = spawnSync(
    process.execPath,
    [path.join(root, "tools", "validate-quartz-package.js"), file],
    {
      cwd: root,
      encoding: "utf8"
    }
  );

  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");

  if (result.status !== 0) {
    failed++;
  }

  console.log("");
}

console.log("============================================================");
console.log(`Validation complete. Failed packages: ${failed}/${files.length}`);

if (failed > 0) {
  process.exit(1);
}
