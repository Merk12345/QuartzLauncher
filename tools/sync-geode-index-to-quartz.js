const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const GEODE_API = "https://api.geode-sdk.org/v1/mods";

const root = path.resolve(__dirname, "..");
const indexDir = path.join(root, "assets", "index");
const geodeOut = path.join(indexDir, "geode-quartz-index.json");
const quartzOut = path.join(indexDir, "quartz-index.json");
const localPackageDir = path.join(root, "assets", "packages");

const perPage = 100;
const maxPages = 200;

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.filter(Boolean).map(String);
}

function developerText(mod) {
  const devs = Array.isArray(mod.developers) ? mod.developers : [];
  return devs
    .map((dev) => dev.display_name || dev.username || dev.name)
    .filter(Boolean)
    .join(", ") || "Unknown";
}

function latestVersion(mod) {
  const versions = Array.isArray(mod.versions) ? mod.versions : [];
  return versions[0] || null;
}

function absoluteDownloadUrl(url) {
  if (!url) return null;
  if (String(url).startsWith("http://") || String(url).startsWith("https://")) return url;
  return `https://api.geode-sdk.org${url}`;
}

async function readQuartzManifest(packagePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(packagePath));
  const file = zip.file("quartz.json");
  if (!file) return null;
  return JSON.parse(await file.async("string"));
}

async function loadLocalQuartzOwnedEntries() {
  if (!fs.existsSync(localPackageDir)) return [];

  const keepIds = new Set([
    "quartz.hello",
    "quartz.hello-native",
    "example.quartz-native-template",
    "itzrealmerk.first-native-test"
  ]);

  const files = fs.readdirSync(localPackageDir)
    .filter((name) => name.endsWith(".quartz"))
    .map((name) => path.join(localPackageDir, name));

  const entries = [];

  for (const file of files) {
    try {
      const manifest = await readQuartzManifest(file);
      if (!manifest || !keepIds.has(manifest.id)) continue;

      entries.push({
        id: manifest.id,
        name: manifest.name || manifest.id,
        developer: manifest.developer || "Quartz Team",
        version: manifest.version || "unknown",
        description: manifest.description || "Quartz package.",
        engine: manifest.engine || "quartz-resource",
        category: manifest.category || "Quartz",
        tags: Array.isArray(manifest.tags) ? manifest.tags : ["Quartz"],
        source: "local-quartz",
        sourceType: "local-quartz",
        packagePath: path.relative(root, file),
        installMode: "local-quartz-package"
      });
    } catch (error) {
      console.warn(`WARN could not read local package ${file}: ${error.message}`);
    }
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchGeodePage(page) {
  const url = `${GEODE_API}?page=${page}&per_page=${perPage}`;

  console.log(`Fetching page ${page}: ${url}`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Geode API failed on page ${page}: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();

  const data =
    json?.payload?.data ||
    json?.payload ||
    json?.data ||
    [];

  if (!Array.isArray(data)) {
    throw new Error(`Unexpected Geode API response on page ${page}.`);
  }

  return data;
}

function convertGeodeMod(mod) {
  const version = latestVersion(mod);
  if (!version) return null;

  const downloadUrl = absoluteDownloadUrl(version.download_link || version.download || version.url);
  if (!downloadUrl) return null;

  const tags = normalizeTags(mod.tags);

  return {
    id: mod.id,
    name: version.name || mod.name || mod.id,
    developer: developerText(mod),
    version: version.version || mod.version || "unknown",
    description: version.description || mod.description || "Geode compatibility package.",
    engine: "geode-compat",
    category: tags[0] || "Geode",
    tags: ["Geode", "Geode Compatibility", ...tags],
    source: "geode-index",
    sourceType: "remote-geode",
    featured: !!mod.featured,
    downloadCount: mod.download_count || mod.downloads || 0,
    geodeVersion: version.geode || null,
    gameVersion: version.gd || null,
    modVersion: version.version || null,
    geodeModId: mod.id,
    geodeDownloadUrl: downloadUrl,
    geodeHash: version.hash || null,
    links: mod.links || {},
    updatedAt: mod.updated_at || version.updated_at || null,
    installMode: "download-and-wrap-geode"
  };
}

async function main() {
  fs.mkdirSync(indexDir, { recursive: true });

  const localQuartz = await loadLocalQuartzOwnedEntries();

  const geodeById = new Map();

  for (let page = 1; page <= maxPages; page++) {
    const mods = await fetchGeodePage(page);

    if (mods.length === 0) {
      console.log(`No mods returned on page ${page}. Stopping.`);
      break;
    }

    for (const mod of mods) {
      const entry = convertGeodeMod(mod);
      if (entry && !geodeById.has(entry.id)) {
        geodeById.set(entry.id, entry);
      }
    }

    if (mods.length < perPage) {
      console.log(`Page ${page} returned ${mods.length}, less than ${perPage}. Stopping.`);
      break;
    }
  }

  const geodeEntries = [...geodeById.values()].sort((a, b) => {
    if (Number(b.featured) !== Number(a.featured)) {
      return Number(b.featured) - Number(a.featured);
    }

    return Number(b.downloadCount || 0) - Number(a.downloadCount || 0);
  });

  const localIds = new Set(localQuartz.map((entry) => entry.id));

  const combinedPackages = [
    ...localQuartz,
    ...geodeEntries.filter((entry) => !localIds.has(entry.id))
  ];

  const generatedAt = new Date().toISOString();

  const combined = {
    format: "quartz.index",
    formatVersion: 1,
    generatedAt,
    notes: [
      "Quartz-native/resource entries are local Quartz packages.",
      "Geode entries are remote compatibility entries and should be downloaded/wrapped on install."
    ],
    packages: combinedPackages
  };

  fs.writeFileSync(geodeOut, JSON.stringify({
    format: "quartz.geode-index",
    formatVersion: 1,
    generatedAt,
    source: GEODE_API,
    count: geodeEntries.length,
    packages: geodeEntries
  }, null, 2) + "\n");

  // Keep quartz-index.json as a plain array because the launcher currently expects array-style index data.
  fs.writeFileSync(quartzOut, JSON.stringify(combinedPackages, null, 2) + "\n");

  console.log("");
  console.log(`Local Quartz entries kept: ${localQuartz.length}`);
  console.log(`Geode entries synced: ${geodeEntries.length}`);
  console.log(`Combined index entries: ${combinedPackages.length}`);
  console.log("");
  console.log(`Wrote ${geodeOut}`);
  console.log(`Wrote ${quartzOut}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
