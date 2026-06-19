const fs = require("fs");
const path = require("path");

const [, , modId, modNameArg] = process.argv;

if (!modId || !modNameArg) {
  console.error("Usage:");
  console.error('  node tools/create-quartz-native-mod.js <mod-id> "<mod name>"');
  console.error("");
  console.error("Example:");
  console.error('  node tools/create-quartz-native-mod.js itzrealmerk.my-mod "My Mod"');
  process.exit(1);
}

const safeFolderName = modId.replace(/[^a-zA-Z0-9._-]/g, "-");
const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "dev-packages", safeFolderName);
const payloadDir = path.join(outDir, "payload");

if (fs.existsSync(outDir)) {
  console.error(`Mod folder already exists: ${outDir}`);
  console.error("Delete it or choose a different mod id.");
  process.exit(1);
}

fs.mkdirSync(payloadDir, { recursive: true });

const manifest = {
  format: "quartz.package",
  formatVersion: 1,
  id: modId,
  name: modNameArg,
  developer: "Your Name",
  version: "1.0.0",
  engine: "quartz-native",
  category: "Utility",
  description: `A Quartz-native mod called ${modNameArg}.`,
  entry: "payload/main.js",
  tags: ["Quartz Native", "Generated"],
  game: "geometry-dash",
  gameVersion: "*",
  permissions: [],
  dependencies: []
};

fs.writeFileSync(
  path.join(outDir, "quartz.json"),
  JSON.stringify(manifest, null, 2)
);

fs.writeFileSync(
  path.join(payloadDir, "main.js"),
`function activate(quartz) {
  quartz.log("${modNameArg} activated.");
  quartz.log("API version: " + quartz.apiVersion);
  quartz.log("Mod ID: " + quartz.mod.id);
  quartz.log("Mod Name: " + quartz.mod.name);

  const launches = quartz.storage.get("launches", 0) + 1;
  quartz.storage.set("launches", launches);

  quartz.log("Launch count: " + launches);

  return {
    ok: true,
    message: "${modNameArg} ran successfully."
  };
}

module.exports = activate;
module.exports.activate = activate;
`
);

fs.writeFileSync(
  path.join(outDir, "README.md"),
`# ${modNameArg}

Generated Quartz-native starter mod.

Engine: quartz-native

Entry:
payload/main.js
`
);

console.log("Created Quartz-native mod:");
console.log(outDir);
console.log("");
console.log("Package it with:");
console.log(`node tools/pack-quartz.js dev-packages/${safeFolderName} assets/packages/${safeFolderName}.quartz`);
