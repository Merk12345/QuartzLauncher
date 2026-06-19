const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

function fail(message) {
  console.error(`Quartz Pack Error: ${message}`);
  process.exit(1);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`Could not read JSON: ${file}\n${error.message}`);
  }
}

function validateManifest(manifest) {
  const required = [
    'format',
    'formatVersion',
    'id',
    'name',
    'developer',
    'version',
    'engine',
    'category',
    'description',
    'entry'
  ];

  for (const key of required) {
    if (!manifest[key]) {
      fail(`Missing required quartz.json field: ${key}`);
    }
  }

  if (manifest.format !== 'quartz.package') {
    fail('Invalid format. Expected "quartz.package".');
  }

  if (Number(manifest.formatVersion) !== 1) {
    fail('Unsupported formatVersion. Expected 1.');
  }

  const allowedEngines = ['quartz-resource', 'quartz-native', 'geode-compat'];

  if (!allowedEngines.includes(manifest.engine)) {
    fail(`Invalid engine "${manifest.engine}". Allowed: ${allowedEngines.join(', ')}`);
  }

  if (!/^[a-z0-9_.-]+$/i.test(manifest.id)) {
    fail(`Invalid id "${manifest.id}". Use letters, numbers, dots, underscores, or dashes.`);
  }
}

function addFolder(zip, folder, baseFolder) {
  for (const item of fs.readdirSync(folder)) {
    const full = path.join(folder, item);
    const rel = path.relative(baseFolder, full).replace(/\\/g, '/');

    if (fs.statSync(full).isDirectory()) {
      addFolder(zip, full, baseFolder);
    } else {
      zip.addLocalFile(full, path.dirname(rel));
    }
  }
}

const inputDir = process.argv[2];
const outputFile = process.argv[3];

if (!inputDir || !outputFile) {
  fail('Usage: node tools/pack-quartz.js <package-folder> <output.quartz>');
}

const packageDir = path.resolve(inputDir);
const outPath = path.resolve(outputFile);
const manifestPath = path.join(packageDir, 'quartz.json');

if (!fs.existsSync(packageDir)) {
  fail(`Package folder does not exist: ${packageDir}`);
}

if (!fs.existsSync(manifestPath)) {
  fail(`Missing quartz.json in: ${packageDir}`);
}

const manifest = readJson(manifestPath);
validateManifest(manifest);

const zip = new AdmZip();
addFolder(zip, packageDir, packageDir);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
zip.writeZip(outPath);

console.log(`Created Quartz package: ${outPath}`);
console.log(`ID: ${manifest.id}`);
console.log(`Name: ${manifest.name}`);
console.log(`Engine: ${manifest.engine}`);
