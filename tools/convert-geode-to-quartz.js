const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

function fail(message) {
  console.error(`Quartz Convert Error: ${message}`);
  process.exit(1);
}

function safeName(value) {
  return String(value || 'unknown')
    .replace(/[^a-z0-9_.-]/gi, '_')
    .replace(/_+/g, '_');
}

function tryReadJson(zip, names) {
  for (const name of names) {
    const entry = zip.getEntry(name);
    if (!entry) continue;

    try {
      return JSON.parse(entry.getData().toString('utf8'));
    } catch {}
  }

  return null;
}

function tryReadText(zip, names) {
  for (const name of names) {
    const entry = zip.getEntry(name);
    if (!entry) continue;

    try {
      return entry.getData().toString('utf8');
    } catch {}
  }

  return '';
}

function tryFindIcon(zip, modId) {
  const candidates = [
    'logo.png',
    'icon.png',
    'mod.png',
    'resources/logo.png',
    'resources/icon.png',
    `resources/${modId}/logo.png`,
    `resources/${modId}/icon.png`,
    `resources/${modId}/mod.png`,
    `resources/${modId}/gscl_icon.png`,
    `resources/${modId}/gscl_icon-hd.png`,
    `resources/${modId}/gscl_icon-uhd.png`
  ];

  for (const name of candidates) {
    const entry = zip.getEntry(name);
    if (entry) {
      return {
        name,
        data: entry.getData()
      };
    }
  }

  const imageEntry = zip.getEntries().find(entry => {
    const n = entry.entryName.toLowerCase();
    return !entry.isDirectory && (
      n.endsWith('/icon.png') ||
      n.endsWith('/logo.png') ||
      n.endsWith('/mod.png') ||
      n.endsWith('.png')
    );
  });

  if (imageEntry) {
    return {
      name: imageEntry.entryName,
      data: imageEntry.getData()
    };
  }

  return null;
}

function normalizeGeodeManifest(raw, geodeFile) {
  const fallbackId = path.basename(geodeFile, '.geode');

  const id =
    raw?.id ||
    raw?.mod?.id ||
    fallbackId;

  const name =
    raw?.name ||
    raw?.mod?.name ||
    id;

  const developer =
    raw?.developer ||
    raw?.developers?.[0] ||
    raw?.author ||
    raw?.authors?.[0] ||
    raw?.creator ||
    'Unknown';

  const version =
    raw?.version ||
    raw?.mod?.version ||
    '1.0.0';

  const description =
    raw?.description ||
    raw?.about ||
    raw?.mod?.description ||
    `Converted Geode compatibility package for ${name}.`;

  return {
    id,
    name,
    developer,
    version,
    description
  };
}

function convertOneGeode(geodePath, outputDir) {
  const absoluteGeode = path.resolve(geodePath);

  if (!fs.existsSync(absoluteGeode)) {
    fail(`File does not exist: ${absoluteGeode}`);
  }

  if (!absoluteGeode.toLowerCase().endsWith('.geode')) {
    fail(`Not a .geode file: ${absoluteGeode}`);
  }

  const geodeZip = new AdmZip(absoluteGeode);

  const rawManifest = tryReadJson(geodeZip, [
    'mod.json',
    'geode.mod.json',
    'about.json'
  ]);

  const meta = normalizeGeodeManifest(rawManifest || {}, absoluteGeode);

  const quartzId = meta.id;
  const quartzName = meta.name;
  const quartzFileName = `${safeName(quartzId)}.quartz`;
  const outPath = path.join(path.resolve(outputDir), quartzFileName);

  const readme =
    tryReadText(geodeZip, ['README.md', 'readme.md', 'about.md', 'details.md']) ||
    `# ${quartzName}

This is a Quartz compatibility package.

Original Geode file:

\`${path.basename(absoluteGeode)}\`

This package is wrapped as \`.quartz\` so Quartz can manage it through the Quartz library.
`;

  const changelog =
    tryReadText(geodeZip, ['CHANGELOG.md', 'changelog.md']) ||
    `# Changelog

## ${meta.version}

- Converted from .geode to .quartz compatibility package.
`;

  const quartzManifest = {
    format: 'quartz.package',
    formatVersion: 1,
    id: quartzId,
    name: quartzName,
    developer: meta.developer,
    version: meta.version,
    engine: 'geode-compat',
    category: 'Utility',
    description: meta.description,
    entry: 'payload/',
    payload: 'payload/mod.geode',
    installAs: path.basename(absoluteGeode),
    tags: ['Quartz Compatible', 'Converted', 'Legacy Support'],
    game: 'geometry-dash',
    gameVersion: '*',
    permissions: [],
    dependencies: []
  };

  const outZip = new AdmZip();

  outZip.addFile('quartz.json', Buffer.from(JSON.stringify(quartzManifest, null, 2) + '\n'));
  outZip.addFile('README.md', Buffer.from(readme));
  outZip.addFile('CHANGELOG.md', Buffer.from(changelog));
  outZip.addLocalFile(absoluteGeode, 'payload', 'mod.geode');

  const icon = tryFindIcon(geodeZip, quartzId);
  if (icon) {
    outZip.addFile('icon.png', icon.data);
  }

  fs.mkdirSync(path.resolve(outputDir), { recursive: true });
  outZip.writeZip(outPath);

  console.log(`Converted: ${path.basename(absoluteGeode)} -> ${outPath}`);
  console.log(`ID: ${quartzManifest.id}`);
  console.log(`Name: ${quartzManifest.name}`);
  console.log(`Engine: ${quartzManifest.engine}`);
  console.log('');

  return outPath;
}

function convertInput(input, outputDir) {
  const absoluteInput = path.resolve(input);

  if (!fs.existsSync(absoluteInput)) {
    fail(`Input does not exist: ${absoluteInput}`);
  }

  const stat = fs.statSync(absoluteInput);

  if (stat.isDirectory()) {
    const files = fs
      .readdirSync(absoluteInput)
      .filter(file => file.toLowerCase().endsWith('.geode'))
      .map(file => path.join(absoluteInput, file));

    if (files.length === 0) {
      fail(`No .geode files found in folder: ${absoluteInput}`);
    }

    for (const file of files) {
      convertOneGeode(file, outputDir);
    }

    console.log(`Done. Converted ${files.length} Geode mods.`);
    return;
  }

  convertOneGeode(absoluteInput, outputDir);
}

const input = process.argv[2];
const outputDir = process.argv[3] || 'converted-packages';

if (!input) {
  fail('Usage: node tools/convert-geode-to-quartz.js <file.geode OR folder> [output-folder]');
}

convertInput(input, outputDir);
