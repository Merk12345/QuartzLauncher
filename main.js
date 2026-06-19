const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');

const STEAM_APP_ID = '322170';
const APP_ICON = path.join(__dirname, 'assets', 'quartzlogo.png');

const PACKAGES_DIR = path.join(__dirname, 'assets', 'packages');
function getDefaultModsDir() {
  if (process.platform === 'win32') {
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    return path.join(
      programFilesX86,
      'Steam',
      'steamapps',
      'common',
      'Geometry Dash',
      'geode',
      'mods'
    );
  }

  if (process.platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Steam',
      'steamapps',
      'common',
      'Geometry Dash',
      'geode',
      'mods'
    );
  }

  return path.join(
    os.homedir(),
    '.local',
    'share',
    'Steam',
    'steamapps',
    'common',
    'Geometry Dash',
    'geode',
    'mods'
  );
}

const MODS_DIR = getDefaultModsDir();

const ISL_PACKAGE_ID = 'itzrealmerk.integrated-spam-list';
const ISL_INSTALLED_FILE = 'itzrealmerk.gscl-viewer.geode';

let mainWindow = null;

app.setName('Quartz Launcher');

function getModsFolder() {
  return MODS_DIR;
}

function ensureModsFolder() {
  fs.mkdirSync(MODS_DIR, { recursive: true });
}

function getISLPath() {
  return path.join(getModsFolder(), ISL_INSTALLED_FILE);
}

function isISLInstalled() {
  return fs.existsSync(getISLPath());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    title: 'Quartz Launcher',
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setIcon(APP_ICON);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

function safeInstallAs(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    throw new Error('Invalid installAs value.');
  }

  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    throw new Error('Unsafe installAs path.');
  }

  if (!fileName.endsWith('.geode')) {
    throw new Error('installAs must end with .geode');
  }

  return fileName;
}

function quartzFetchBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('Too many redirects.'));
      return;
    }

    const req = https.get(url, {
      headers: {
        'User-Agent': 'QuartzLauncher/0.1'
      }
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        const next = response.headers.location;

        if (!next) {
          reject(new Error('Redirect missing location.'));
          return;
        }

        resolve(quartzFetchBuffer(new URL(next, url).toString(), redirects + 1));
        return;
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }

      const chunks = [];

      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.setTimeout(12000, () => {
      req.destroy(new Error('Request timed out.'));
    });

    req.on('error', reject);
  });
}

async function quartzFetchJson(url) {
  const buffer = await quartzFetchBuffer(url);
  return JSON.parse(buffer.toString('utf8'));
}

function quartzCategoryFromGeode(mod, latest) {
  const text = [
    ...(Array.isArray(mod.tags) ? mod.tags : []),
    mod.id || '',
    latest?.name || '',
    latest?.description || ''
  ].join(' ').toLowerCase();

  if (text.includes('texture') || text.includes('cosmetic') || text.includes('customization')) return 'Visual';
  if (text.includes('interface') || text.includes('menu') || text.includes('ui')) return 'Menu/UI';
  if (text.includes('editor') || text.includes('creator') || text.includes('level')) return 'Creator';
  if (text.includes('practice') || text.includes('startpos') || text.includes('hitbox')) return 'Practice';
  if (text.includes('fps') || text.includes('performance') || text.includes('lag') || text.includes('bugfix')) return 'Performance';
  if (text.includes('funny') || text.includes('meme') || text.includes('silly')) return 'Funny';
  if (text.includes('gameplay') || text.includes('cheat')) return 'Gameplay';

  const gd = latest && latest.gd ? latest.gd : {};
  if (gd.android32 || gd.android64 || gd.ios) return 'Mobile';

  return 'Utility';
}

function zipText(zip, names) {
  const entries = zip.getEntries();

  for (const wanted of names) {
    const wantedLower = wanted.toLowerCase();

    const entry = entries.find(e => {
      const n = e.entryName.toLowerCase();
      return !e.isDirectory && (n === wantedLower || n.endsWith('/' + wantedLower));
    });

    if (entry) return entry.getData().toString('utf8');
  }

  return '';
}

function zipDataUrl(zip, names) {
  const entries = zip.getEntries();

  for (const wanted of names) {
    const wantedLower = wanted.toLowerCase();

    const entry = entries.find(e => {
      const n = e.entryName.toLowerCase();
      return !e.isDirectory && (n === wantedLower || n.endsWith('/' + wantedLower));
    });

    if (entry) {
      const ext = path.extname(entry.entryName).toLowerCase();
      const mime =
        ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
        ext === '.webp' ? 'image/webp' :
        'image/png';

      return `data:${mime};base64,${entry.getData().toString('base64')}`;
    }
  }

  return '';
}

function readLocalQuartzPackages({ page, search, category }) {
  const mods = [];
  const errors = [];
  const seenIds = new Set();

  fs.mkdirSync(PACKAGES_DIR, { recursive: true });
  ensureModsFolder();

  if (page !== 1) {
    return { mods, errors, seenIds };
  }

  const files = fs
    .readdirSync(PACKAGES_DIR)
    .filter(file => file.toLowerCase().endsWith('.quartz'));

  for (const file of files) {
    try {
      const packagePath = path.join(PACKAGES_DIR, file);
      const quartzZip = new AdmZip(packagePath);
      const manifestEntry = quartzZip.getEntry('quartz.json');

      if (!manifestEntry) throw new Error('Missing quartz.json');

      const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));

      const id = manifest.id || file;
      const installAs = manifest.installAs || '';
      const installed = installAs ? fs.existsSync(path.join(MODS_DIR, installAs)) : false;
      const localCategory = manifest.category || 'Utility';

      const searchable = [
        manifest.name || '',
        id,
        manifest.developer || '',
        manifest.description || '',
        localCategory,
        ...(Array.isArray(manifest.tags) ? manifest.tags : [])
      ].join(' ').toLowerCase();

      if (category === 'Installed' && !installed) continue;
      if (category !== 'All' && category !== 'Installed' && localCategory !== category) continue;
      if (search && !searchable.includes(search.toLowerCase())) continue;

      let iconDataUrl = '';
      let detailsText = zipText(quartzZip, ['details.md', 'about.md', 'description.md', 'README.md', 'readme.md']);
      let changelogText = zipText(quartzZip, ['changelog.md', 'CHANGELOG.md']);

      if (manifest.payload) {
        const payloadEntry = quartzZip.getEntry(manifest.payload);

        if (payloadEntry) {
          try {
            const geodeZip = new AdmZip(payloadEntry.getData());
            const resourceId = String(installAs || id || '').replace(/\.geode$/i, '');

            iconDataUrl = zipDataUrl(geodeZip, [
              `resources/${resourceId}/logo.png`,
              `resources/${resourceId}/icon.png`,
              `resources/${resourceId}/mod.png`,
              `resources/${resourceId}/gscl_icon.png`,
              `resources/${resourceId}/gscl_icon-hd.png`,
              `resources/${resourceId}/gscl_icon-uhd.png`,
              'logo.png',
              'icon.png',
              'mod.png'
            ]);

            if (!detailsText) {
              detailsText = zipText(geodeZip, ['about.md', 'details.md', 'description.md', 'README.md', 'readme.md']);
            }

            if (!changelogText) {
              changelogText = zipText(geodeZip, ['changelog.md', 'CHANGELOG.md']);
            }
          } catch (geodeError) {
            errors.push({ file, error: 'Could not read embedded .geode: ' + geodeError.message });
          }
        }
      }

      if (!iconDataUrl) {
        iconDataUrl = zipDataUrl(quartzZip, ['icon.png', 'logo.png', 'mod.png']);
      }

      seenIds.add(id);

      mods.push({
        id,
        name: manifest.name || file,
        developer: manifest.developer || 'Unknown',
        version: manifest.version || '0.0.0',
        description: manifest.description || '',
        type: manifest.type || 'quartz-package',
        tags: manifest.tags || [],
        category: localCategory,
        payload: manifest.payload || '',
        installAs,
        packageFile: file,
        installed,
        iconDataUrl,
        detailsText: detailsText || manifest.description || '',
        changelogText: changelogText || '',
        source: 'quartz-local'
      });
    } catch (error) {
      errors.push({ file, error: error.message });
    }
  }

  return { mods, errors, seenIds };
}

async function getPagedGeodeMods({ page, pageSize, search, category, seenIds }) {
  const mods = [];
  const errors = [];

  const geodeUrl = new URL('https://api.geode-sdk.org/v1/mods');
  geodeUrl.searchParams.set('per_page', String(pageSize));
  geodeUrl.searchParams.set('page', String(page));

  if (search) {
    geodeUrl.searchParams.set('query', search);
  }

  let total = 0;

  try {
    const geode = await quartzFetchJson(geodeUrl.toString());

    const geodeMods = geode?.payload?.data || [];
    total = Number(geode?.payload?.count || geode?.payload?.total || geodeMods.length || 0);

    for (const mod of geodeMods) {
      if (!mod || !mod.id || seenIds.has(mod.id)) continue;

      const latest = Array.isArray(mod.versions) ? mod.versions[0] : null;
      if (!latest) continue;

      const modCategory = quartzCategoryFromGeode(mod, latest);
      const installed = fs.existsSync(path.join(MODS_DIR, `${mod.id}.geode`));

      if (category === 'Installed' && !installed) continue;
      if (category !== 'All' && category !== 'Installed' && modCategory !== category) continue;

      const developer =
        Array.isArray(mod.developers) && mod.developers.length
          ? mod.developers.map(dev => dev.display_name || dev.username).join(', ')
          : 'Unknown';

      mods.push({
        id: mod.id,
        name: latest.name || mod.id,
        developer,
        version: latest.version || '0.0.0',
        description: latest.description || '',
        type: 'geode-online',
        tags: Array.isArray(mod.tags) ? mod.tags : [],
        category: modCategory,
        payload: latest.download_link || '',
        installAs: `${mod.id}.geode`,
        packageFile: '',
        installed,
        iconDataUrl: '',
        iconUrl: `https://api.geode-sdk.org/v1/mods/${encodeURIComponent(mod.id)}/logo?version=${encodeURIComponent(latest.version || '')}`,
        detailsText: mod.about || latest.description || '',
        changelogText: mod.changelog || '',
        source: 'geode-online',
        downloadLink: latest.download_link || '',
        downloadCount: mod.download_count || 0,
        featured: !!mod.featured,
        links: mod.links || {},
        geode: latest.geode || '',
        gd: latest.gd || {}
      });

      seenIds.add(mod.id);
    }
  } catch (onlineError) {
    errors.push({ file: 'Geode Online Index', error: onlineError.message });
  }

  return { mods, errors, total };
}

async function installLocalQuartzPackage(packageId) {
  ensureModsFolder();

  const files = fs
    .readdirSync(PACKAGES_DIR)
    .filter(file => file.toLowerCase().endsWith('.quartz'));

  for (const file of files) {
    const packagePath = path.join(PACKAGES_DIR, file);
    const zip = new AdmZip(packagePath);
    const manifestEntry = zip.getEntry('quartz.json');

    if (!manifestEntry) continue;

    const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));

    if (manifest.id !== packageId) continue;

    const installAs = safeInstallAs(manifest.installAs);
    const payloadEntry = zip.getEntry(manifest.payload);

    if (!payloadEntry) {
      throw new Error('Payload missing from package: ' + manifest.payload);
    }

    const outputPath = path.join(MODS_DIR, installAs);
    fs.writeFileSync(outputPath, payloadEntry.getData());

    return {
      ok: true,
      packageId,
      installedPath: outputPath
    };
  }

  return null;
}

async function installOnlineGeodePackage(packageId) {
  ensureModsFolder();

  const url = `https://api.geode-sdk.org/v1/mods/${encodeURIComponent(packageId)}`;
  const json = await quartzFetchJson(url);
  const mod = json?.payload || json?.payload?.data || json?.data || null;

  let latest = null;

  if (mod && Array.isArray(mod.versions)) {
    latest = mod.versions[0];
  }

  if (!latest) {
    const searchJson = await quartzFetchJson(`https://api.geode-sdk.org/v1/mods?query=${encodeURIComponent(packageId)}&per_page=10&page=1`);
    const found = (searchJson?.payload?.data || []).find(m => m.id === packageId);
    latest = found && Array.isArray(found.versions) ? found.versions[0] : null;
  }

  const downloadLink = latest?.download_link;

  if (!downloadLink) {
    throw new Error('Geode mod is missing download link.');
  }

  const data = await quartzFetchBuffer(downloadLink);
  const outputPath = path.join(MODS_DIR, `${packageId}.geode`);

  fs.writeFileSync(outputPath, data);

  return {
    ok: true,
    packageId,
    installedPath: outputPath
  };
}


function getInstalledGeodeMods() {
  ensureModsFolder();

  const installedFiles = fs
    .readdirSync(MODS_DIR)
    .filter(file => file.toLowerCase().endsWith('.geode'));

  const localMatches = new Map();

  if (fs.existsSync(PACKAGES_DIR)) {
    const packageFiles = fs
      .readdirSync(PACKAGES_DIR)
      .filter(file => file.toLowerCase().endsWith('.quartz'));

    for (const file of packageFiles) {
      try {
        const packagePath = path.join(PACKAGES_DIR, file);
        const quartzZip = new AdmZip(packagePath);
        const manifestEntry = quartzZip.getEntry('quartz.json');

        if (!manifestEntry) continue;

        const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
        const installAs = manifest.installAs || '';

        if (!installAs) continue;

        let iconDataUrl = '';
        let detailsText = zipText(quartzZip, ['details.md', 'about.md', 'description.md', 'README.md', 'readme.md']);
        let changelogText = zipText(quartzZip, ['changelog.md', 'CHANGELOG.md']);

        if (manifest.payload) {
          const payloadEntry = quartzZip.getEntry(manifest.payload);

          if (payloadEntry) {
            try {
              const geodeZip = new AdmZip(payloadEntry.getData());
              const resourceId = String(installAs || manifest.id || '').replace(/\.geode$/i, '');

              iconDataUrl = zipDataUrl(geodeZip, [
                `resources/${resourceId}/logo.png`,
                `resources/${resourceId}/icon.png`,
                `resources/${resourceId}/mod.png`,
                `resources/${resourceId}/gscl_icon.png`,
                `resources/${resourceId}/gscl_icon-hd.png`,
                `resources/${resourceId}/gscl_icon-uhd.png`,
                'logo.png',
                'icon.png',
                'mod.png'
              ]);

              if (!detailsText) {
                detailsText = zipText(geodeZip, ['about.md', 'details.md', 'description.md', 'README.md', 'readme.md']);
              }

              if (!changelogText) {
                changelogText = zipText(geodeZip, ['changelog.md', 'CHANGELOG.md']);
              }
            } catch {}
          }
        }

        if (!iconDataUrl) {
          iconDataUrl = zipDataUrl(quartzZip, ['icon.png', 'logo.png', 'mod.png']);
        }

        localMatches.set(installAs, {
          id: manifest.id || installAs.replace(/\.geode$/i, ''),
          name: manifest.name || installAs.replace(/\.geode$/i, ''),
          developer: manifest.developer || 'Unknown',
          version: manifest.version || '0.0.0',
          description: manifest.description || '',
          type: manifest.type || 'quartz-package',
          tags: manifest.tags || [],
          category: manifest.category || 'Utility',
          payload: manifest.payload || '',
          installAs,
          packageFile: file,
          installed: true,
          iconDataUrl,
          detailsText: detailsText || manifest.description || '',
          changelogText: changelogText || '',
          source: 'quartz-local'
        });
      } catch {}
    }
  }

  return installedFiles.map(file => {
    if (localMatches.has(file)) {
      return localMatches.get(file);
    }

    const id = file.replace(/\.geode$/i, '');

    return {
      id,
      name: id,
      developer: 'Unknown',
      version: 'Installed',
      description: 'Installed Geode mod.',
      type: 'geode-installed',
      tags: ['Installed'],
      category: 'Utility',
      payload: '',
      installAs: file,
      packageFile: '',
      installed: true,
      iconDataUrl: '',
      iconUrl: `https://api.geode-sdk.org/v1/mods/${encodeURIComponent(id)}/logo`,
      detailsText: 'Installed Geode mod.',
      changelogText: '',
      source: 'installed-folder'
    };
  }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('launch-gd', async () => {
  try {
    await shell.openExternal(`steam://run/${STEAM_APP_ID}`);
    return { ok: true };
  } catch (error) {
    try {
      const child = spawn('steam', ['-applaunch', STEAM_APP_ID], {
        detached: true,
        stdio: 'ignore'
      });

      child.unref();

      return { ok: true };
    } catch (fallbackError) {
      return { ok: false, error: fallbackError.message || error.message };
    }
  }
});




ipcMain.handle('get-mod-status', async () => {
  try {
    ensureModsFolder();

    return {
      ok: true,
      modsFolder: getModsFolder(),
      islInstalled: isISLInstalled(),
      islPath: getISLPath()
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});



ipcMain.handle('install-isl', async () => {
  try {
    return await installLocalQuartzPackage(ISL_PACKAGE_ID);
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});

ipcMain.handle('uninstall-isl', async () => {
  try {
    ensureModsFolder();

    const targetPath = getISLPath();

    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }

    return {
      ok: true,
      removedPath: targetPath
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});

ipcMain.handle('open-mods-folder', async () => {
  try {
    ensureModsFolder();

    const result = await shell.openPath(MODS_DIR);

    if (result) {
      return { ok: false, error: result };
    }

    return {
      ok: true,
      path: MODS_DIR
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});

ipcMain.handle('open-link', async (_event, url) => {
  try {
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL.');
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new Error('Only http/https links are allowed.');
    }

    await shell.openExternal(url);

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});


// ===== Quartz Native Package Library OVERRIDE START =====

function qNativeDataDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'QuartzLauncher');
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'QuartzLauncher');
  }

  return path.join(os.homedir(), '.config', 'QuartzLauncher');
}

const QUARTZ_NATIVE_DATA_DIR = qNativeDataDir();
const QUARTZ_NATIVE_LIBRARY_DIR = path.join(QUARTZ_NATIVE_DATA_DIR, 'library');
const QUARTZ_NATIVE_PACKAGES_DIR = path.join(QUARTZ_NATIVE_DATA_DIR, 'packages');
const QUARTZ_NATIVE_CACHE_DIR = path.join(QUARTZ_NATIVE_DATA_DIR, 'cache');

function qEnsureNativeFolders() {
  fs.mkdirSync(QUARTZ_NATIVE_DATA_DIR, { recursive: true });
  fs.mkdirSync(QUARTZ_NATIVE_LIBRARY_DIR, { recursive: true });
  fs.mkdirSync(QUARTZ_NATIVE_PACKAGES_DIR, { recursive: true });
  fs.mkdirSync(QUARTZ_NATIVE_CACHE_DIR, { recursive: true });
}

function qSafePackageFileName(id) {
  return `${String(id || 'unknown').replace(/[^a-z0-9_.-]/gi, '_')}.quartz`;
}

function qTextFromZip(zip, names) {
  for (const name of names) {
    const entry = zip.getEntry(name);
    if (entry) return entry.getData().toString('utf8');
  }

  return '';
}

function qDataUrlFromZip(zip, names) {
  for (const name of names) {
    const entry = zip.getEntry(name);
    if (!entry) continue;

    const lower = name.toLowerCase();
    let mime = 'image/png';

    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mime = 'image/jpeg';
    if (lower.endsWith('.webp')) mime = 'image/webp';
    if (lower.endsWith('.gif')) mime = 'image/gif';

    return `data:${mime};base64,${entry.getData().toString('base64')}`;
  }

  return '';
}

function qReadQuartzPackage(packagePath, installed = false) {
  try {
    const zip = new AdmZip(packagePath);
    const manifestEntry = zip.getEntry('quartz.json');

    if (!manifestEntry) return null;

    const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));

    if (!manifest.id || !manifest.name) return null;

    const engine =
      manifest.engine ||
      manifest.type ||
      (String(manifest.payload || '').toLowerCase().endsWith('.geode') ? 'geode-compat' : 'quartz-resource');

    const packageFileName = qSafePackageFileName(manifest.id);
    const installedPath = path.join(QUARTZ_NATIVE_LIBRARY_DIR, packageFileName);
    const isInstalled = installed || fs.existsSync(installedPath);

    const iconDataUrl = qDataUrlFromZip(zip, [
      'icon.png',
      'logo.png',
      'mod.png',
      'assets/icon.png',
      'assets/logo.png'
    ]);

    const detailsText =
      qTextFromZip(zip, ['README.md', 'readme.md', 'details.md', 'about.md', 'description.md']) ||
      manifest.description ||
      '';

    const changelogText =
      qTextFromZip(zip, ['CHANGELOG.md', 'changelog.md']) ||
      '';

    return {
      id: manifest.id,
      name: manifest.name,
      developer: manifest.developer || manifest.author || 'Unknown',
      version: manifest.version || '0.0.0',
      description: manifest.description || '',
      category: manifest.category || 'Utility',
      tags: Array.isArray(manifest.tags) ? manifest.tags : [],
      engine,
      type: engine,
      source: 'quartz-package',
      format: manifest.format || 'quartz.package',
      formatVersion: manifest.formatVersion || 1,
      entry: manifest.entry || manifest.payload || '',
      payload: manifest.payload || manifest.entry || '',
      packageFile: path.basename(packagePath),
      packagePath,
      installed: isInstalled,
      installAs: packageFileName,
      iconDataUrl,
      iconUrl: '',
      detailsText,
      changelogText,
      quartzLibraryPath: installedPath
    };
  } catch (error) {
    console.warn('Could not read Quartz package:', packagePath, error.message);
    return null;
  }
}

function qPackageSourceDirs() {
  qEnsureNativeFolders();

  return [
    PACKAGES_DIR,
    QUARTZ_NATIVE_PACKAGES_DIR
  ].filter(Boolean);
}

function qListAvailableQuartzPackages() {
  qEnsureNativeFolders();

  const byId = new Map();

  for (const dir of qPackageSourceDirs()) {
    if (!fs.existsSync(dir)) continue;

    for (const file of fs.readdirSync(dir)) {
      if (!file.toLowerCase().endsWith('.quartz')) continue;

      const packagePath = path.join(dir, file);
      const mod = qReadQuartzPackage(packagePath, false);

      if (mod) byId.set(mod.id, mod);
    }
  }

  for (const installed of qListInstalledQuartzPackages()) {
    if (!byId.has(installed.id)) {
      byId.set(installed.id, installed);
    } else {
      const existing = byId.get(installed.id);
      existing.installed = true;
      existing.quartzLibraryPath = installed.quartzLibraryPath;
    }
  }

  return [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function qListInstalledQuartzPackages() {
  qEnsureNativeFolders();

  if (!fs.existsSync(QUARTZ_NATIVE_LIBRARY_DIR)) return [];

  return fs
    .readdirSync(QUARTZ_NATIVE_LIBRARY_DIR)
    .filter(file => file.toLowerCase().endsWith('.quartz'))
    .map(file => qReadQuartzPackage(path.join(QUARTZ_NATIVE_LIBRARY_DIR, file), true))
    .filter(Boolean)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function qFindAvailableQuartzPackage(packageId) {
  return qListAvailableQuartzPackages().find(mod => mod.id === packageId);
}

function qFilterQuartzPackages(mods, options = {}) {
  const search = String(options.search || '').trim().toLowerCase();
  const category = String(options.category || 'All');

  let filtered = [...mods];

  if (category === 'Installed') {
    filtered = filtered.filter(mod => mod.installed);
  } else if (category && category !== 'All') {
    filtered = filtered.filter(mod => String(mod.category || '').toLowerCase() === category.toLowerCase());
  }

  if (search) {
    filtered = filtered.filter(mod => {
      const haystack = [
        mod.id,
        mod.name,
        mod.developer,
        mod.description,
        mod.category,
        mod.engine,
        ...(mod.tags || [])
      ].join(' ').toLowerCase();

      return haystack.includes(search);
    });
  }

  return filtered;
}

function qPageQuartzPackages(mods, options = {}) {
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Number(options.pageSize || 9));
  const total = mods.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    mods: mods.slice(start, start + pageSize),
    meta: {
      page: safePage,
      pageSize,
      total,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1,
      source: 'quartz-native-library'
    }
  };
}

// Replace old Geode-focused handlers with Quartz-native package handlers.




// ===== Quartz Native Package Library OVERRIDE END =====


// ===== Quartz Auto Import .geode/.quartz START =====

function qAutoReadJson(zip, names) {
  for (const name of names) {
    const entry = zip.getEntry(name);
    if (!entry) continue;

    try {
      return JSON.parse(entry.getData().toString('utf8'));
    } catch {}
  }

  return null;
}

function qAutoReadText(zip, names) {
  for (const name of names) {
    const entry = zip.getEntry(name);
    if (!entry) continue;

    try {
      return entry.getData().toString('utf8');
    } catch {}
  }

  return '';
}

function qAutoFindIcon(zip, modId) {
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
      return entry.getData();
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

  return imageEntry ? imageEntry.getData() : null;
}

function qAutoNormalizeGeodeManifest(raw, geodeFile) {
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

function qConvertGeodeToQuartzPackage(geodePath, outputDir = QUARTZ_NATIVE_PACKAGES_DIR) {
  qEnsureNativeFolders();

  const absoluteGeode = path.resolve(geodePath);

  if (!fs.existsSync(absoluteGeode)) {
    throw new Error(`File does not exist: ${absoluteGeode}`);
  }

  if (!absoluteGeode.toLowerCase().endsWith('.geode')) {
    throw new Error(`Not a .geode file: ${absoluteGeode}`);
  }

  const geodeZip = new AdmZip(absoluteGeode);
  const rawManifest = qAutoReadJson(geodeZip, [
    'mod.json',
    'geode.mod.json',
    'about.json'
  ]);

  const meta = qAutoNormalizeGeodeManifest(rawManifest || {}, absoluteGeode);
  const outPath = path.join(outputDir, qSafePackageFileName(meta.id));

  const readme =
    qAutoReadText(geodeZip, ['README.md', 'readme.md', 'about.md', 'details.md']) ||
    `# ${meta.name}

This is a Quartz compatibility mod.

Original file:

\`${path.basename(absoluteGeode)}\`

Quartz converted this from \`.geode\` to \`.quartz\` automatically during import.
`;

  const changelog =
    qAutoReadText(geodeZip, ['CHANGELOG.md', 'changelog.md']) ||
    `# Changelog

## ${meta.version}

- Automatically converted from .geode to .quartz compatibility format.
`;

  const quartzManifest = {
    format: 'quartz.package',
    formatVersion: 1,
    id: meta.id,
    name: meta.name,
    developer: meta.developer,
    version: meta.version,
    engine: 'geode-compat',
    category: 'Utility',
    description: meta.description,
    entry: 'payload/',
    payload: 'payload/mod.geode',
    installAs: path.basename(absoluteGeode),
    tags: ['Quartz Compatible', 'Auto Converted', 'Legacy Support'],
    game: 'geometry-dash',
    gameVersion: '*',
    permissions: [],
    dependencies: [],
    convertedFrom: {
      format: 'geode',
      fileName: path.basename(absoluteGeode)
    }
  };

  const outZip = new AdmZip();

  outZip.addFile('quartz.json', Buffer.from(JSON.stringify(quartzManifest, null, 2) + '\n'));
  outZip.addFile('README.md', Buffer.from(readme));
  outZip.addFile('CHANGELOG.md', Buffer.from(changelog));
  outZip.addLocalFile(absoluteGeode, 'payload', 'mod.geode');

  const icon = qAutoFindIcon(geodeZip, meta.id);
  if (icon) {
    outZip.addFile('icon.png', icon);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  outZip.writeZip(outPath);

  return {
    packagePath: outPath,
    mod: qReadQuartzPackage(outPath, false)
  };
}

function qImportLocalModFile(filePath) {
  if (String(filePath || '').toLowerCase().endsWith('.quartz')) {
    const validationResult = qValidateQuartzBeforeUse(filePath, 'import');

    if (!validationResult.ok) {
      return validationResult;
    }
  }

  qEnsureNativeFolders();

  const absoluteFile = path.resolve(filePath);
  const ext = path.extname(absoluteFile).toLowerCase();

  if (!fs.existsSync(absoluteFile)) {
    throw new Error(`File does not exist: ${absoluteFile}`);
  }

  let sourcePackagePath = '';
  let converted = false;

  if (ext === '.geode') {
    const convertedResult = qConvertGeodeToQuartzPackage(absoluteFile, QUARTZ_NATIVE_PACKAGES_DIR);
    sourcePackagePath = convertedResult.packagePath;
    converted = true;
  } else if (ext === '.quartz') {
    const tempMod = qReadQuartzPackage(absoluteFile, false);

    if (!tempMod) {
      throw new Error('Invalid .quartz package.');
    }

    sourcePackagePath = path.join(QUARTZ_NATIVE_PACKAGES_DIR, qSafePackageFileName(tempMod.id));

    if (path.resolve(absoluteFile) !== path.resolve(sourcePackagePath)) {
      fs.copyFileSync(absoluteFile, sourcePackagePath);
    }
  } else {
    throw new Error('Quartz can only import .quartz or .geode files.');
  }

  const mod = qReadQuartzPackage(sourcePackagePath, false);

  if (!mod) {
    throw new Error('Converted/imported package could not be read.');
  }

  const libraryPath = path.join(QUARTZ_NATIVE_LIBRARY_DIR, qSafePackageFileName(mod.id));
  fs.copyFileSync(sourcePackagePath, libraryPath);

  const installedMod = qReadQuartzPackage(libraryPath, true);

  return {
    ok: true,
    imported: true,
    converted,
    sourceFile: absoluteFile,
    packagePath: sourcePackagePath,
    libraryPath,
    quartzPackagesDir: QUARTZ_NATIVE_PACKAGES_DIR,
    quartzLibraryDir: QUARTZ_NATIVE_LIBRARY_DIR,
    mod: installedMod
  };
}

try {
} catch {}

ipcMain.handle('import-local-mod-file', async (event) => {
  try {
    const parent = BrowserWindow.fromWebContents(event.sender);

    const result = await dialog.showOpenDialog(parent, {
      title: 'Import Quartz Mod',
      properties: ['openFile'],
      filters: [
        { name: 'Quartz or Geode Mods', extensions: ['quartz', 'geode'] },
        { name: 'Quartz Mods', extensions: ['quartz'] },
        { name: 'Geode Mods', extensions: ['geode'] }
      ]
    });

    if (result.canceled || !result.filePaths || !result.filePaths[0]) {
      return {
        ok: false,
        canceled: true
      };
    }

    return qImportLocalModFile(result.filePaths[0]);
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});

// ===== Quartz Auto Import .geode/.quartz END =====


// ===== Quartz Import Folder START =====

const QUARTZ_NATIVE_IMPORTS_DIR = path.join(QUARTZ_NATIVE_DATA_DIR, 'mods');
const QUARTZ_NATIVE_IMPORTED_DIR = path.join(QUARTZ_NATIVE_IMPORTS_DIR, '.imported');

function qUniqueImportedPath(filePath) {
  const base = path.basename(filePath);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(QUARTZ_NATIVE_IMPORTED_DIR, `${stamp}-${base}`);
}

function qProcessImportFolder() {
  qEnsureImportFolders();

  const files = fs
    .readdirSync(QUARTZ_NATIVE_IMPORTS_DIR)
    .filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ext === '.geode' || ext === '.quartz';
    })
    .map(file => path.join(QUARTZ_NATIVE_IMPORTS_DIR, file));

  const imported = [];
  const failed = [];

  for (const file of files) {
    try {
      const result = qImportLocalModFile(file);

      imported.push({
        file: path.basename(file),
        converted: result.converted,
        mod: result.mod
      });

      fs.renameSync(file, qUniqueImportedPath(file));
    } catch (error) {
      failed.push({
        file: path.basename(file),
        error: error.message
      });
    }
  }

  return {
    ok: true,
    importFolder: QUARTZ_NATIVE_IMPORTS_DIR,
    importedFolder: QUARTZ_NATIVE_IMPORTED_DIR,
    imported,
    failed
  };
}

try {
} catch {}

ipcMain.handle('open-import-folder', async () => {
  try {
    qEnsureImportFolders();

    const result = await shell.openPath(QUARTZ_NATIVE_IMPORTS_DIR);

    if (result) {
      return {
        ok: false,
        error: result,
        importFolder: QUARTZ_NATIVE_IMPORTS_DIR
      };
    }

    return {
      ok: true,
      importFolder: QUARTZ_NATIVE_IMPORTS_DIR
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});

try {
} catch {}

ipcMain.handle('process-import-folder', async () => {
  try {
    return qProcessImportFolder();
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      imported: [],
      failed: []
    };
  }
});

// ===== Quartz Import Folder END =====


// ===== Quartz Mods Folder Auto Scan START =====

try {
} catch {}

ipcMain.handle('open-quartz-mods-folder', async () => {
  try {
    qEnsureImportFolders();

    const result = await shell.openPath(QUARTZ_NATIVE_IMPORTS_DIR);

    if (result) {
      return {
        ok: false,
        error: result,
        modsFolder: QUARTZ_NATIVE_IMPORTS_DIR
      };
    }

    return {
      ok: true,
      modsFolder: QUARTZ_NATIVE_IMPORTS_DIR
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});

try {
} catch {}

ipcMain.handle('auto-scan-quartz-mods-folder', async () => {
  try {
    return qProcessImportFolder();
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      imported: [],
      failed: []
    };
  }
});

// ===== Quartz Mods Folder Auto Scan END =====


// ===== Quartz Mods Folder README Notice START =====
// Override import folder creation to always include the warning README.
// ===== Quartz Mods Folder README Notice END =====

// ===== Quartz Single Mods Folder README Override START =====
function qWriteModsFolderReadme() {
  try {
    qEnsureNativeFolders();

    fs.mkdirSync(QUARTZ_NATIVE_IMPORTS_DIR, { recursive: true });
    fs.mkdirSync(QUARTZ_NATIVE_IMPORTED_DIR, { recursive: true });

    const oldReadmePath = path.join(QUARTZ_NATIVE_IMPORTS_DIR, 'README - PUT MODS HERE.txt');
    const readmePath = path.join(QUARTZ_NATIVE_IMPORTS_DIR, "README - DON'T PUT IN .IMPORTED.txt");

    if (fs.existsSync(oldReadmePath)) {
      fs.unlinkSync(oldReadmePath);
    }

    const text = `Quartz Mods Folder

Put your mods directly in this main mods folder.

You can drag these files here:
- .quartz
- .geode

DO NOT put mods inside the .imported folder.

The .imported folder is only used by Quartz after a mod has already been imported.
Quartz moves processed files there so they do not get imported over and over again.

Correct:
mods/MyMod.quartz
mods/MyOldGeodeMod.geode

Wrong:
mods/.imported/MyMod.quartz
mods/.imported/MyOldGeodeMod.geode
`;

    fs.writeFileSync(readmePath, text, 'utf8');
  } catch (error) {
    console.warn('Could not write Quartz Mods folder README:', error.message);
  }
}

function qEnsureImportFolders() {
  qEnsureNativeFolders();
  fs.mkdirSync(QUARTZ_NATIVE_IMPORTS_DIR, { recursive: true });
  fs.mkdirSync(QUARTZ_NATIVE_IMPORTED_DIR, { recursive: true });
  qWriteModsFolderReadme();
}
// ===== Quartz Single Mods Folder README Override END =====


// ===== Quartz Enable Disable System START =====

const QUARTZ_NATIVE_ENABLED_DIR = path.join(QUARTZ_NATIVE_DATA_DIR, 'enabled');
const QUARTZ_NATIVE_DISABLED_DIR = path.join(QUARTZ_NATIVE_DATA_DIR, 'disabled');

function qEnableSafePackageFileName(id) {
  if (typeof qSafePackageFileName === 'function') {
    return qSafePackageFileName(id);
  }

  return `${String(id || 'unknown').replace(/[^a-z0-9_.-]/gi, '_')}.quartz`;
}

function qEnsureEnableFolders() {
  qEnsureNativeFolders();
  fs.mkdirSync(QUARTZ_NATIVE_ENABLED_DIR, { recursive: true });
  fs.mkdirSync(QUARTZ_NATIVE_DISABLED_DIR, { recursive: true });
}

function qEnabledPackagePath(packageId) {
  return path.join(QUARTZ_NATIVE_ENABLED_DIR, qEnableSafePackageFileName(packageId));
}

function qLibraryPackagePath(packageId) {
  return path.join(QUARTZ_NATIVE_LIBRARY_DIR, qEnableSafePackageFileName(packageId));
}

try {
} catch {}


try {
} catch {}


try {
} catch {}

ipcMain.handle('install-quartz-package', async (event, packageId) => {
  try {
    qEnsureEnableFolders();

    const mod = qFindAvailableQuartzPackage(packageId);

    if (mod) {
      const quartzPackagePathForValidation =
        mod.packagePath ||
        mod.path ||
        mod.filePath ||
        mod.sourcePath;

      const validationResult = qValidateQuartzBeforeUse(quartzPackagePathForValidation, 'install');

      if (!validationResult.ok) {
        return validationResult;
      }
    }


    if (!mod) {
      return {
        ok: false,
        error: `Quartz package not found: ${packageId}`
      };
    }

    const dest = qLibraryPackagePath(mod.id);
    fs.copyFileSync(mod.packagePath, dest);

    const enabledMod = qEnableQuartzMod(mod.id);

    return {
      ok: true,
      installed: true,
      enabled: true,
      quartzLibraryDir: QUARTZ_NATIVE_LIBRARY_DIR,
      quartzEnabledDir: QUARTZ_NATIVE_ENABLED_DIR,
      mod: enabledMod
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});

try {
} catch {}

ipcMain.handle('uninstall-quartz-package', async (event, packageId) => {
  try {
    qEnsureEnableFolders();

    const libraryFile = qLibraryPackagePath(packageId);
    const enabledFile = qEnabledPackagePath(packageId);

    if (fs.existsSync(libraryFile)) fs.unlinkSync(libraryFile);
    if (fs.existsSync(enabledFile)) fs.unlinkSync(enabledFile);

    return {
      ok: true,
      uninstalled: true,
      enabled: false,
      quartzLibraryDir: QUARTZ_NATIVE_LIBRARY_DIR,
      quartzEnabledDir: QUARTZ_NATIVE_ENABLED_DIR
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});

try {
} catch {}


try {
} catch {}


try {
} catch {}


// ===== Quartz Enable Disable System END =====


// ===== Quartz Enable Disable Default Enabled Fix START =====

const QUARTZ_NATIVE_DISABLED_MARKERS_DIR = path.join(QUARTZ_NATIVE_DATA_DIR, 'disabled');

function qDisabledMarkerPath(packageId) {
  return path.join(QUARTZ_NATIVE_DISABLED_MARKERS_DIR, qEnableSafePackageFileName(packageId));
}

function qIsQuartzModDisabled(packageId) {
  qEnsureEnableFolders();
  return fs.existsSync(qDisabledMarkerPath(packageId));
}

// Installed mods are enabled by default unless a disabled marker exists.
function qIsQuartzModEnabled(packageId) {
  return !qIsQuartzModDisabled(packageId);
}

function qInstalledModsWithEnabledState() {
  qEnsureEnableFolders();

  return qListInstalledQuartzPackages().map(mod => ({
    ...mod,
    enabled: qIsQuartzModEnabled(mod.id)
  }));
}

function qAvailableModsWithEnabledState() {
  qEnsureEnableFolders();

  return qListAvailableQuartzPackages().map(mod => ({
    ...mod,
    enabled: mod.installed ? qIsQuartzModEnabled(mod.id) : false
  }));
}

function qEnableQuartzMod(packageId) {
  qEnsureEnableFolders();

  const source = qLibraryPackagePath(packageId);

  if (!fs.existsSync(source)) {
    throw new Error(`Cannot enable because this mod is not installed: ${packageId}`);
  }

  const disabledMarker = qDisabledMarkerPath(packageId);

  if (fs.existsSync(disabledMarker)) {
    fs.unlinkSync(disabledMarker);
  }

  const enabledCopy = qEnabledPackagePath(packageId);
  fs.copyFileSync(source, enabledCopy);

  const mod = qReadQuartzPackage(source, true);

  return {
    ...mod,
    enabled: true
  };
}

function qDisableQuartzMod(packageId) {
  qEnsureEnableFolders();

  const source = qLibraryPackagePath(packageId);

  if (!fs.existsSync(source)) {
    throw new Error(`Cannot disable because this mod is not installed: ${packageId}`);
  }

  const enabledCopy = qEnabledPackagePath(packageId);

  if (fs.existsSync(enabledCopy)) {
    fs.unlinkSync(enabledCopy);
  }

  const disabledMarker = qDisabledMarkerPath(packageId);
  fs.copyFileSync(source, disabledMarker);

  const mod = qReadQuartzPackage(source, true);

  return {
    ...mod,
    enabled: false
  };
}

try {
} catch {}

ipcMain.handle('enable-quartz-mod', async (event, packageId) => {
  try {
    return {
      ok: true,
      enabled: true,
      mod: qEnableQuartzMod(packageId),
      quartzEnabledDir: QUARTZ_NATIVE_ENABLED_DIR,
      quartzDisabledDir: QUARTZ_NATIVE_DISABLED_MARKERS_DIR
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});

try {
} catch {}

ipcMain.handle('disable-quartz-mod', async (event, packageId) => {
  try {
    return {
      ok: true,
      enabled: false,
      mod: qDisableQuartzMod(packageId),
      quartzEnabledDir: QUARTZ_NATIVE_ENABLED_DIR,
      quartzDisabledDir: QUARTZ_NATIVE_DISABLED_MARKERS_DIR
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});

try {
} catch {}

ipcMain.handle('get-installed-mods', async () => {
  try {
    return {
      ok: true,
      quartzDataDir: QUARTZ_NATIVE_DATA_DIR,
      quartzLibraryDir: QUARTZ_NATIVE_LIBRARY_DIR,
      quartzEnabledDir: QUARTZ_NATIVE_ENABLED_DIR,
      quartzDisabledDir: QUARTZ_NATIVE_DISABLED_MARKERS_DIR,
      mods: qInstalledModsWithEnabledState()
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      mods: []
    };
  }
});

try {
} catch {}


// ===== Quartz Enable Disable Default Enabled Fix END =====

// ===== Quartz Index Hide Installed Mods START =====
try {
} catch {}

// ===== Quartz Index Hide Installed Mods END =====

// ===== Quartz Index All Installed Detection START =====
try {
} catch {}

ipcMain.handle('get-quartz-index', async (event, options = {}) => {
  try {
    const allMods = qAvailableModsWithEnabledState();
    const installedMods = allMods.filter(mod => mod.installed);
    const availableMods = allMods.filter(mod => !mod.installed);

    const filtered = qFilterQuartzPackages(availableMods, {
      ...options,
      category: options.category === 'Installed' ? 'All' : options.category
    });

    const paged = qPageQuartzPackages(filtered, options);

    return {
      ok: true,
      quartzDataDir: QUARTZ_NATIVE_DATA_DIR,
      quartzLibraryDir: QUARTZ_NATIVE_LIBRARY_DIR,
      quartzEnabledDir: QUARTZ_NATIVE_ENABLED_DIR,
      index: {
        mods: paged.mods,
        meta: {
          ...paged.meta,
          allCount: allMods.length,
          installedCount: installedMods.length,
          availableCount: availableMods.length,
          allInstalled: allMods.length > 0 && availableMods.length === 0
        }
      }
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      index: {
        mods: [],
        meta: {
          page: 1,
          pageSize: Number(options.pageSize || 9),
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
          allCount: 0,
          installedCount: 0,
          availableCount: 0,
          allInstalled: false,
          source: 'quartz-native-library'
        }
      }
    };
  }
});
// ===== Quartz Index All Installed Detection END =====

// ===== Quartz Runtime Folder Structure START =====

const QUARTZ_RUNTIME_DIR = path.join(QUARTZ_NATIVE_DATA_DIR, 'runtime');
const QUARTZ_RUNTIME_STAGED_DIR = path.join(QUARTZ_RUNTIME_DIR, 'staged');
const QUARTZ_RUNTIME_LOGS_DIR = path.join(QUARTZ_RUNTIME_DIR, 'logs');
const QUARTZ_RUNTIME_MANIFEST = path.join(QUARTZ_RUNTIME_DIR, 'enabled-manifest.json');
const QUARTZ_RUNTIME_STATUS = path.join(QUARTZ_RUNTIME_DIR, 'runtime-status.json');

function qEnsureRuntimeFolders() {
  qEnsureNativeFolders();
  qEnsureEnableFolders();

  fs.mkdirSync(QUARTZ_RUNTIME_DIR, { recursive: true });
  fs.mkdirSync(QUARTZ_RUNTIME_STAGED_DIR, { recursive: true });
  fs.mkdirSync(QUARTZ_RUNTIME_LOGS_DIR, { recursive: true });
}


function qValidateQuartzPackageFileSync(packagePath) {
  try {
    if (!packagePath || !fs.existsSync(packagePath)) {
      return {
        ok: false,
        error: `Package file does not exist: ${packagePath || 'unknown'}`
      };
    }

    if (path.extname(packagePath).toLowerCase() !== '.quartz') {
      return {
        ok: true,
        skipped: true,
        output: 'Not a .quartz package.'
      };
    }

    const validatorPath = path.join(__dirname, 'tools', 'validate-quartz-package.js');

    if (!fs.existsSync(validatorPath)) {
      return {
        ok: false,
        error: `Quartz validator is missing: ${validatorPath}`
      };
    }

    const result = spawnSync(process.execPath, [validatorPath, packagePath], {
      cwd: __dirname,
      encoding: 'utf8'
    });

    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();

    return {
      ok: result.status === 0,
      status: result.status,
      output,
      error: result.status === 0 ? null : output || 'Package validation failed.'
    };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : String(error)
    };
  }
}

function qValidationFailedResult(packagePath, validation, action = 'install') {
  return {
    ok: false,
    error:
      `Quartz blocked this package during ${action} because validation failed.\n\n` +
      `Package: ${packagePath}\n\n` +
      `${validation?.error || validation?.output || 'Unknown validation error.'}`
  };
}

function qValidateQuartzBeforeUse(packagePath, action = 'install') {
  const validation = qValidateQuartzPackageFileSync(packagePath);

  if (!validation.ok) {
    return qValidationFailedResult(packagePath, validation, action);
  }

  return { ok: true, validation };
}

function qRuntimeSafeFolderName(id) {
  return String(id || 'unknown').replace(/[^a-z0-9_.-]/gi, '_');
}

function qCleanRuntimeStagedFolder() {
  qEnsureRuntimeFolders();

  for (const item of fs.readdirSync(QUARTZ_RUNTIME_STAGED_DIR)) {
    const full = path.join(QUARTZ_RUNTIME_STAGED_DIR, item);
    fs.rmSync(full, { recursive: true, force: true });
  }
}

function qStageQuartzPackageForRuntime(mod) {
  qEnsureRuntimeFolders();

  if (!mod || !mod.packagePath || !fs.existsSync(mod.packagePath)) {
    return null;
  }

  const stageDir = path.join(QUARTZ_RUNTIME_STAGED_DIR, qRuntimeSafeFolderName(mod.id));
  fs.mkdirSync(stageDir, { recursive: true });

  const stagedPackage = path.join(stageDir, qSafePackageFileName(mod.id));
  fs.copyFileSync(mod.packagePath, stagedPackage);

  const zip = new AdmZip(mod.packagePath);

  try {
    zip.extractAllTo(path.join(stageDir, 'package'), true);
  } catch (error) {
    console.warn('Could not extract package for runtime staging:', mod.id, error.message);
  }

  return {
    id: mod.id,
    name: mod.name,
    engine: mod.engine || mod.type || 'unknown',
    version: mod.version || '0.0.0',
    stagedPackage,
    stageDir,
    packageFolder: path.join(stageDir, 'package'),
    entry: mod.entry || mod.payload || '',
    payload: mod.payload || '',
    enabled: true
  };
}

function qBuildRuntimeManifest() {
  qEnsureRuntimeFolders();

  const installed = qInstalledModsWithEnabledState();
  const enabled = installed.filter(mod => mod.enabled);

  qCleanRuntimeStagedFolder();

  const staged = [];

  for (const mod of enabled) {
    const stagedMod = qStageQuartzPackageForRuntime(mod);

    if (stagedMod) {
      staged.push(stagedMod);
    }
  }

  const manifest = {
    format: 'quartz.runtime.manifest',
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    runtimeDir: QUARTZ_RUNTIME_DIR,
    stagedDir: QUARTZ_RUNTIME_STAGED_DIR,
    enabledCount: staged.length,
    mods: staged
  };

  fs.writeFileSync(QUARTZ_RUNTIME_MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  const status = {
    ok: true,
    generatedAt: manifest.generatedAt,
    runtimeDir: QUARTZ_RUNTIME_DIR,
    stagedDir: QUARTZ_RUNTIME_STAGED_DIR,
    logsDir: QUARTZ_RUNTIME_LOGS_DIR,
    manifestPath: QUARTZ_RUNTIME_MANIFEST,
    enabledCount: staged.length,
    installedCount: installed.length
  };

  fs.writeFileSync(QUARTZ_RUNTIME_STATUS, JSON.stringify(status, null, 2) + '\n', 'utf8');

  return {
    ...status,
    manifest
  };
}

try {
} catch {}

ipcMain.handle('sync-quartz-runtime', async () => {
  try {
    return qBuildRuntimeManifest();
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});

try {
} catch {}

ipcMain.handle('open-quartz-runtime-folder', async () => {
  try {
    qEnsureRuntimeFolders();

    const result = await shell.openPath(QUARTZ_RUNTIME_DIR);

    if (result) {
      return {
        ok: false,
        error: result,
        runtimeDir: QUARTZ_RUNTIME_DIR
      };
    }

    return {
      ok: true,
      runtimeDir: QUARTZ_RUNTIME_DIR
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});

try {
} catch {}

ipcMain.handle('get-quartz-runtime-status', async () => {
  try {
    qEnsureRuntimeFolders();

    let status = null;

    if (fs.existsSync(QUARTZ_RUNTIME_STATUS)) {
      try {
        status = JSON.parse(fs.readFileSync(QUARTZ_RUNTIME_STATUS, 'utf8'));
      } catch {}
    }

    return {
      ok: true,
      runtimeDir: QUARTZ_RUNTIME_DIR,
      stagedDir: QUARTZ_RUNTIME_STAGED_DIR,
      logsDir: QUARTZ_RUNTIME_LOGS_DIR,
      manifestPath: QUARTZ_RUNTIME_MANIFEST,
      statusPath: QUARTZ_RUNTIME_STATUS,
      status
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});

// ===== Quartz Runtime Folder Structure END =====

// ===== Quartz Runtime Auto Sync On Startup START =====
function qSafeAutoSyncRuntime(reason = 'startup') {
  try {
    if (typeof qBuildRuntimeManifest === 'function') {
      const result = qBuildRuntimeManifest();
      console.log(`Quartz runtime synced on ${reason}: ${result.enabledCount || 0} enabled mods`);
      return result;
    }

    if (typeof qEnsureRuntimeFolders === 'function') {
      qEnsureRuntimeFolders();
      console.log(`Quartz runtime folders created on ${reason}`);
    }
  } catch (error) {
    console.warn(`Quartz runtime auto sync failed on ${reason}:`, error.message);
  }
}

app.whenReady().then(() => {
  setTimeout(() => qSafeAutoSyncRuntime('startup'), 1000);
});
// ===== Quartz Runtime Auto Sync On Startup END =====
