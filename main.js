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
    fullscreen: true,
    autoHideMenuBar: true,
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


// ===== Quartz Developer Tools START =====

function qGetDevWorkspaceDir() {
  return path.join(app.getPath('userData'), 'dev-workspace');
}

function qGetDevBuildsDir() {
  return path.join(qGetDevWorkspaceDir(), 'builds');
}

function qDevListWorkspaceProjects() {
  const workspaceDir = qGetDevWorkspaceDir();
  fs.mkdirSync(workspaceDir, { recursive: true });

  return fs
    .readdirSync(workspaceDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => !entry.name.startsWith('.'))
    .filter(entry => entry.name !== 'builds')
    .map(entry => {
      const modDir = path.join(workspaceDir, entry.name);
      const manifestPath = path.join(modDir, 'quartz.json');

      if (!fs.existsSync(manifestPath)) return null;

      const modStat = fs.statSync(modDir);
      const manifestStat = fs.statSync(manifestPath);
      const newestTime = Math.max(modStat.mtimeMs, manifestStat.mtimeMs);

      return {
        name: entry.name,
        modDir,
        manifestPath,
        mtimeMs: newestTime
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function qDevGetNewestWorkspaceProject() {
  return qDevListWorkspaceProjects()[0] || null;
}

function qDevReadManifest(manifestPath) {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function qDevResolveWorkspaceProject(projectName = '') {
  const projects = qDevListWorkspaceProjects();

  if (projectName) {
    const found = projects.find(project => project.name === projectName);
    if (found) return found;
  }

  return projects[0] || null;
}

function qDevGetBuiltPackageForProject(projectName = '') {
  const project = qDevResolveWorkspaceProject(projectName);

  if (!project) {
    return {
      ok: false,
      error: 'No dev project found. Click Create Starter Mod first.',
      workspaceDir: qGetDevWorkspaceDir()
    };
  }

  let manifest;

  try {
    manifest = qDevReadManifest(project.manifestPath);
  } catch (error) {
    return {
      ok: false,
      error: `Could not read quartz.json: ${error.message}`,
      sourceDir: project.modDir
    };
  }

  const packagePath = path.join(qGetDevBuildsDir(), qDevPackageFileName(manifest));

  return {
    ok: true,
    project,
    manifest,
    packagePath
  };
}

function qDevListBuiltPackages() {
  const buildsDir = qGetDevBuildsDir();
  fs.mkdirSync(buildsDir, { recursive: true });

  return fs
    .readdirSync(buildsDir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .filter(entry => entry.name.toLowerCase().endsWith('.quartz'))
    .map(entry => {
      const packagePath = path.join(buildsDir, entry.name);
      const stat = fs.statSync(packagePath);

      return {
        name: entry.name,
        packagePath,
        mtimeMs: stat.mtimeMs
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function qDevGetNewestBuiltPackage() {
  return qDevListBuiltPackages()[0] || null;
}

function qDevSlug(value, fallback = 'my-quartz-mod') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return slug || fallback;
}

function qDevValidationIsOk(validation) {
  if (!validation) return false;
  if (validation.ok === false) return false;
  if (validation.valid === false) return false;
  if (validation.error) return false;
  if (Array.isArray(validation.errors) && validation.errors.length > 0) return false;
  return true;
}

function qDevPackageFileName(manifest) {
  const id = qDevSlug(manifest?.id || manifest?.name || 'quartz-mod');
  const version = qDevSlug(manifest?.version || '0.1.0', '0.1.0');
  return `${id}-${version}.quartz`;
}

function qDevAddFolderToZip(zip, sourceDir, rootDir) {
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolute = path.join(sourceDir, entry.name);
    const relative = path.relative(rootDir, absolute).replace(/\\/g, '/');

    if (!relative || relative.startsWith('..')) continue;

    const ignoredNames = new Set([
      '.git',
      'node_modules',
      'dist',
      'build',
      'builds',
      '.DS_Store'
    ]);

    if (ignoredNames.has(entry.name)) continue;
    if (entry.name.endsWith('.quartz')) continue;

    if (entry.isDirectory()) {
      qDevAddFolderToZip(zip, absolute, rootDir);
      continue;
    }

    const zipDir = path.dirname(relative) === '.' ? '' : path.dirname(relative);
    zip.addLocalFile(absolute, zipDir);
  }
}

function qDevBuildPackageFromFolder(sourceDir, outPath) {
  const zip = new AdmZip();
  qDevAddFolderToZip(zip, sourceDir, sourceDir);
  zip.writeZip(outPath);
}

ipcMain.handle('dev-open-workspace-folder', async () => {
  try {
    const workspaceDir = qGetDevWorkspaceDir();
    fs.mkdirSync(workspaceDir, { recursive: true });

    const result = await shell.openPath(workspaceDir);

    if (result) {
      return { ok: false, error: result, workspaceDir };
    }

    return {
      ok: true,
      workspaceDir,
      message: 'Opened Quartz dev workspace.'
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('dev-create-template', async (_event, options = {}) => {
  try {
    const workspaceDir = qGetDevWorkspaceDir();
    fs.mkdirSync(workspaceDir, { recursive: true });

    const requestedName = String(options.name || 'My Quartz Mod').trim() || 'My Quartz Mod';
    const requestedId = String(options.id || '').trim();
    const requestedAuthor = String(options.author || 'YourName').trim() || 'YourName';
    const requestedDescription = String(options.description || 'A starter Quartz-native mod.').trim() || 'A starter Quartz-native mod.';
    const requestedTemplate = String(options.template || 'basic').trim() || 'basic';

    const baseSlug = qDevSlug(requestedId || requestedName, 'my-quartz-mod').replace(/^local\./, '');
    const safeId = requestedId
      ? qDevSlug(requestedId, `local.${baseSlug}`)
      : `local.${baseSlug}`;

    let folderName = baseSlug;
    let modDir = path.join(workspaceDir, folderName);
    let counter = 2;

    while (fs.existsSync(modDir)) {
      folderName = `${baseSlug}-${counter}`;
      modDir = path.join(workspaceDir, folderName);
      counter += 1;
    }

    const payloadDir = path.join(modDir, 'payload');
    fs.mkdirSync(payloadDir, { recursive: true });

    const finalId = folderName === baseSlug
      ? safeId
      : `${safeId}-${counter - 1}`;

    const manifest = {
      format: 'quartz.package',
      formatVersion: 1,
      id: finalId,
      name: requestedName,
      version: '0.1.0',
      author: requestedAuthor,
      engine: 'quartz-native',
      entry: 'payload/main.js',
      description: requestedDescription,
      dependencies: [],
      permissions: [],
      template: requestedTemplate
    };

    fs.writeFileSync(
      path.join(modDir, 'quartz.json'),
      JSON.stringify(manifest, null, 2) + '\n',
      'utf8'
    );

    const NL = String.fromCharCode(10);
    const templateType = ['basic', 'empty', 'ui', 'settings'].includes(requestedTemplate)
      ? requestedTemplate
      : 'basic';

    let starterMainLines = [];
    let templateReadme = 'Basic Quartz Native Mod';

    if (templateType === 'empty') {
      templateReadme = 'Empty Package';
      starterMainLines = [
        "'use strict';",
        "",
        "// Empty Quartz package starter.",
        "// Add your mod code here when you are ready.",
        "",
        "module.exports = {",
        `  id: ${JSON.stringify(finalId)},`,
        `  name: ${JSON.stringify(requestedName)},`,
        "  type: 'empty-starter'",
        "};",
        ""
      ];
    } else if (templateType === 'ui') {
      templateReadme = 'UI Mod Starter';
      starterMainLines = [
        "'use strict';",
        "",
        "// UI Mod Starter",
        "// Use this file as a starting point for Quartz-native UI work.",
        "",
        "function initQuartzUI() {",
        `  console.log(${JSON.stringify(`${requestedName} UI starter loaded.`)});`,
        "}",
        "",
        "initQuartzUI();",
        "",
        "module.exports = {",
        `  id: ${JSON.stringify(finalId)},`,
        `  name: ${JSON.stringify(requestedName)},`,
        "  type: 'ui-starter'",
        "};",
        ""
      ];
    } else if (templateType === 'settings') {
      templateReadme = 'Settings Mod Starter';
      starterMainLines = [
        "'use strict';",
        "",
        "// Settings Mod Starter",
        "// This starter includes a basic settings object you can expand later.",
        "",
        "const defaultSettings = {",
        "  enabled: true",
        "};",
        "",
        "function loadSettings() {",
        `  console.log(${JSON.stringify(`${requestedName} settings starter loaded.`)});`,
        "  return { ...defaultSettings };",
        "}",
        "",
        "module.exports = {",
        `  id: ${JSON.stringify(finalId)},`,
        `  name: ${JSON.stringify(requestedName)},`,
        "  type: 'settings-starter',",
        "  defaultSettings,",
        "  loadSettings",
        "};",
        ""
      ];

      fs.writeFileSync(
        path.join(payloadDir, 'settings.json'),
        JSON.stringify({ enabled: true }, null, 2) + NL,
        'utf8'
      );
    } else {
      starterMainLines = [
        "'use strict';",
        "",
        `console.log(${JSON.stringify(`Hello from ${requestedName}!`)});`,
        "",
        "module.exports = {",
        `  id: ${JSON.stringify(finalId)},`,
        `  name: ${JSON.stringify(requestedName)},`,
        "  type: 'basic-starter'",
        "};",
        ""
      ];
    }

    fs.writeFileSync(
      path.join(payloadDir, 'main.js'),
      starterMainLines.join(NL),
      'utf8'
    );

    const readmeText = [
      `# ${requestedName}`,
      "",
      requestedDescription,
      "",
      "Created with Quartz Launcher Dev Tools.",
      "",
      `Template: ${templateReadme}`,
      "",
      "## Files",
      "",
      "- quartz.json - package manifest",
      "- payload/main.js - starter mod entry file",
      ""
    ].join(NL);

    fs.writeFileSync(
      path.join(modDir, 'README.md'),
      readmeText,
      'utf8'
    );

    const changelogText = [
      "# Changelog",
      "",
      "## 0.1.0",
      "",
      "- Initial starter mod.",
      ""
    ].join(NL);

    fs.writeFileSync(
      path.join(modDir, 'CHANGELOG.md'),
      changelogText,
      'utf8'
    );

    await shell.openPath(modDir);

    return {
      ok: true,
      modDir,
      manifest,
      message: `Created starter mod: ${requestedName}`
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});


ipcMain.handle('dev-list-projects', async () => {
  try {
    const projects = qDevListWorkspaceProjects().map(project => {
      let manifest = null;

      try {
        manifest = qDevReadManifest(project.manifestPath);
      } catch {}

      return {
        name: project.name,
        modDir: project.modDir,
        manifestPath: project.manifestPath,
        modified: project.mtimeMs,
        id: manifest?.id || project.name,
        displayName: manifest?.name || project.name,
        version: manifest?.version || '',
        engine: manifest?.engine || '',
        author: manifest?.author || '',
        description: manifest?.description || ''
      };
    });

    return {
      ok: true,
      workspaceDir: qGetDevWorkspaceDir(),
      buildsDir: qGetDevBuildsDir(),
      projects
    };
  } catch (error) {
    return { ok: false, error: error.message, projects: [] };
  }
});

ipcMain.handle('dev-open-project-folder', async (_event, projectName) => {
  try {
    const project = qDevResolveWorkspaceProject(projectName);

    if (!project) {
      return {
        ok: false,
        error: 'No dev project found. Click Create Starter Mod first.',
        workspaceDir: qGetDevWorkspaceDir()
      };
    }

    const result = await shell.openPath(project.modDir);

    if (result) {
      return { ok: false, error: result, modDir: project.modDir };
    }

    return {
      ok: true,
      modDir: project.modDir,
      message: `Opened project folder: ${project.name}`
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('dev-build-quartz-package', async (_event, projectName = '') => {
  try {
    const project = qDevResolveWorkspaceProject(projectName);

    if (!project) {
      return {
        ok: false,
        error: 'No dev project found. Click Create Starter Mod first.',
        workspaceDir: qGetDevWorkspaceDir()
      };
    }

    const sourceDir = project.modDir;
    const manifestPath = project.manifestPath;

    let manifest;
    try {
      manifest = qDevReadManifest(manifestPath);
    } catch (error) {
      return {
        ok: false,
        error: `Could not read quartz.json: ${error.message}`,
        sourceDir
      };
    }

    const buildsDir = qGetDevBuildsDir();
    fs.mkdirSync(buildsDir, { recursive: true });

    const outPath = path.join(buildsDir, qDevPackageFileName(manifest));
    qDevBuildPackageFromFolder(sourceDir, outPath);

    const validation = qValidateQuartzPackageFileSync(outPath);
    const valid = qDevValidationIsOk(validation);

    return {
      ok: valid,
      projectName: project.name,
      packagePath: outPath,
      sourceDir,
      manifest,
      validation,
      message: valid
        ? `Built project: ${project.name}`
        : `Built project, but validation found issues: ${project.name}`
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});



ipcMain.handle('dev-validate-quartz-package', async (_event, projectName = '') => {
  try {
    const built = qDevGetBuiltPackageForProject(projectName);

    if (!built.ok) return built;

    if (!fs.existsSync(built.packagePath)) {
      return {
        ok: false,
        error: 'No built .quartz package found for this project. Click Build .quartz first.',
        projectName: built.project.name,
        packagePath: built.packagePath
      };
    }

    const validation = qValidateQuartzPackageFileSync(built.packagePath);
    const valid = qDevValidationIsOk(validation);

    return {
      ok: valid,
      projectName: built.project.name,
      packagePath: built.packagePath,
      validation,
      message: valid
        ? `Selected project build passed validation: ${built.project.name}`
        : `Selected project build has validation issues: ${built.project.name}`
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('dev-test-install-latest-package', async (_event, projectName = '') => {
  try {
    const built = qDevGetBuiltPackageForProject(projectName);

    if (!built.ok) return built;

    if (!fs.existsSync(built.packagePath)) {
      return {
        ok: false,
        error: 'No built .quartz package found for this project. Click Build .quartz first.',
        projectName: built.project.name,
        packagePath: built.packagePath
      };
    }

    const validation = qValidateQuartzBeforeUse(built.packagePath, 'import');

    if (!qDevValidationIsOk(validation)) {
      return {
        ok: false,
        error: 'Selected project build failed validation before test install.',
        projectName: built.project.name,
        packagePath: built.packagePath,
        validation
      };
    }

    qEnsureImportFolders();

    const importPath = path.join(QUARTZ_NATIVE_IMPORTS_DIR, path.basename(built.packagePath));
    fs.copyFileSync(built.packagePath, importPath);

    const processResult = qProcessImportFolder();

    return {
      ok: processResult?.ok !== false,
      projectName: built.project.name,
      packagePath: built.packagePath,
      importPath,
      processResult,
      message: `Test installed selected project build: ${built.project.name}`
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});




ipcMain.handle('dev-open-builds-folder', async () => {
  try {
    const buildsDir = qGetDevBuildsDir();
    fs.mkdirSync(buildsDir, { recursive: true });

    const result = await shell.openPath(buildsDir);

    if (result) {
      return { ok: false, error: result, buildsDir };
    }

    return {
      ok: true,
      buildsDir,
      message: 'Opened Quartz dev builds folder.'
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});


ipcMain.handle('dev-get-latest-built-package', async () => {
  try {
    const latest = qDevGetNewestBuiltPackage();

    if (!latest) {
      return {
        ok: false,
        error: 'No built .quartz package found yet.',
        buildsDir: qGetDevBuildsDir()
      };
    }

    return {
      ok: true,
      packagePath: latest.packagePath,
      name: latest.name,
      message: `Newest built package: ${latest.name}`
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});


function qDevFormatEntry(entry) {
  if (entry.isDirectory()) return `DIR  ${entry.name}/`;
  return `FILE ${entry.name}`;
}

function qDevIgnoredTreeName(name) {
  return new Set([
    '.git',
    'node_modules',
    'dist',
    'build',
    'builds',
    '.DS_Store'
  ]).has(name);
}

function qDevSafeResolve(rootDir, targetPath) {
  const root = path.resolve(rootDir);
  const target = path.resolve(targetPath);

  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('Path escaped the selected project folder.');
  }

  return target;
}

function qDevGetProjectEntryFile(project, manifest) {
  const entry = String(manifest?.entry || 'payload/main.js');

  if (path.isAbsolute(entry)) {
    throw new Error('Manifest entry must be a relative path.');
  }

  const entryPath = qDevSafeResolve(project.modDir, path.join(project.modDir, entry));

  if (!fs.existsSync(entryPath)) {
    throw new Error(`Entry file does not exist: ${entry}`);
  }

  return {
    entry,
    entryPath,
    code: fs.readFileSync(entryPath, 'utf8')
  };
}

function qDevTreeLines(dir, rootDir, prefix = '', depth = 0, state = { count: 0 }) {
  if (depth > 5) return [];

  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(entry => !qDevIgnoredTreeName(entry.name))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  const lines = [];

  entries.forEach((entry, index) => {
    if (state.count > 220) return;

    const last = index === entries.length - 1;
    const connector = last ? '└─ ' : '├─ ';
    const entryPath = path.join(dir, entry.name);
    const label = entry.isDirectory() ? `${entry.name}/` : entry.name;

    lines.push(`${prefix}${connector}${label}`);
    state.count += 1;

    if (entry.isDirectory()) {
      const nextPrefix = prefix + (last ? '   ' : '│  ');
      lines.push(...qDevTreeLines(entryPath, rootDir, nextPrefix, depth + 1, state));
    }
  });

  return lines;
}

function qDevRunStarterInSandbox(entryInfo) {
  const vm = require('vm');
  const NL = String.fromCharCode(10);
  const logs = [];
  const moduleCache = new Map();

  const capture = (...args) => {
    logs.push(args.map(value => {
      if (typeof value === 'string') return value;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }).join(' '));
  };

  const consoleBridge = {
    log: capture,
    warn: (...args) => capture('[warn]', ...args),
    error: (...args) => capture('[error]', ...args)
  };

  const entryPath = path.resolve(entryInfo.entryPath);
  const entryParts = String(entryInfo.entry || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);

  let payloadRoot = path.dirname(entryPath);
  const payloadIndex = entryParts.indexOf('payload');

  if (payloadIndex >= 0) {
    const upCount = Math.max(0, entryParts.length - payloadIndex - 2);
    payloadRoot = path.resolve(path.dirname(entryPath), ...Array(upCount).fill('..'));
  }

  const isInsidePayload = (filePath) => {
    const relative = path.relative(payloadRoot, filePath);
    return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
  };

  const resolveLocalRequire = (fromFile, request) => {
    const requested = String(request || '');

    if (!requested || requested.includes('\0')) {
      throw new Error('Invalid require path.');
    }

    if (!requested.startsWith('./') && !requested.startsWith('../')) {
      throw new Error(`Sandbox require only supports local files. Blocked: ${requested}`);
    }

    const basePath = path.resolve(path.dirname(fromFile), requested);
    const candidates = [];

    if (path.extname(basePath)) {
      candidates.push(basePath);
    } else {
      candidates.push(`${basePath}.js`);
      candidates.push(`${basePath}.json`);
      candidates.push(path.join(basePath, 'index.js'));
      candidates.push(path.join(basePath, 'index.json'));
    }

    for (const candidate of candidates) {
      const resolved = path.resolve(candidate);

      if (!isInsidePayload(resolved)) {
        throw new Error(`Sandbox require cannot leave payload folder: ${requested}`);
      }

      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        return resolved;
      }
    }

    throw new Error(`Cannot find local module: ${requested}`);
  };

  const loadModule = (filePath, codeOverride = null) => {
    const resolved = path.resolve(filePath);

    if (!isInsidePayload(resolved)) {
      throw new Error(`Sandbox blocked file outside payload folder: ${resolved}`);
    }

    if (moduleCache.has(resolved)) {
      return moduleCache.get(resolved).exports;
    }

    const extension = path.extname(resolved).toLowerCase();
    const mod = {
      exports: {}
    };

    moduleCache.set(resolved, mod);

    if (extension === '.json') {
      const jsonText = codeOverride === null
        ? fs.readFileSync(resolved, 'utf8')
        : String(codeOverride);

      mod.exports = JSON.parse(jsonText);
      return mod.exports;
    }

    if (extension !== '.js') {
      throw new Error(`Sandbox require only supports .js and .json files: ${resolved}`);
    }

    const code = codeOverride === null
      ? fs.readFileSync(resolved, 'utf8')
      : String(codeOverride);

    const localRequire = (request) => {
      const requiredPath = resolveLocalRequire(resolved, request);
      return loadModule(requiredPath);
    };

    const sandbox = {
      console: consoleBridge,
      module: mod,
      exports: mod.exports,
      require: localRequire,
      __filename: resolved,
      __dirname: path.dirname(resolved)
    };

    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, {
      filename: resolved,
      timeout: 1000
    });

    return mod.exports;
  };

  const exportedModule = loadModule(entryPath, entryInfo.code);
  let exported = '';

  try {
    exported = JSON.stringify(exportedModule, null, 2);
  } catch {
    exported = String(exportedModule);
  }

  return [
    `Ran ${entryInfo.entry}`,
    '',
    logs.length ? logs.join(NL) : '(no console output)',
    '',
    'module.exports:',
    exported
  ].join(NL);
}

ipcMain.handle('dev-run-terminal-command', async (_event, projectName = '', rawCommand = '') => {
  try {
    const command = String(rawCommand || '').trim().toLowerCase().split(/\s+/)[0];

    const allowed = new Set(['status', 'ls', 'tree', 'manifest', 'check', 'run']);

    if (!allowed.has(command)) {
      return {
        ok: false,
        error: `Unknown safe Dev Terminal command: ${rawCommand}`
      };
    }

    const project = qDevResolveWorkspaceProject(projectName);

    if (!project) {
      return {
        ok: false,
        error: 'No dev project selected. Create or select a project first.',
        workspaceDir: qGetDevWorkspaceDir()
      };
    }

    const manifest = qDevReadManifest(project.manifestPath);

    if (command === 'status') {
      const status = qDevGetProjectStatus(project.name);

      return {
        ok: true,
        command,
        projectName: project.name,
        output: qDevFormatProjectStatus(status),
        status
      };
    }

    if (command === 'ls') {
      const entries = fs
        .readdirSync(project.modDir, { withFileTypes: true })
        .filter(entry => !qDevIgnoredTreeName(entry.name))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(qDevFormatEntry);

      return {
        ok: true,
        command,
        projectName: project.name,
        output: entries.length ? entries.join('\n') : '(project folder is empty)'
      };
    }

    if (command === 'tree') {
      const lines = [
        `${project.name}/`,
        ...qDevTreeLines(project.modDir, project.modDir)
      ];

      return {
        ok: true,
        command,
        projectName: project.name,
        output: lines.join('\n')
      };
    }

    if (command === 'manifest') {
      return {
        ok: true,
        command,
        projectName: project.name,
        output: JSON.stringify(manifest, null, 2)
      };
    }

    if (command === 'check') {
      const entryInfo = qDevGetProjectEntryFile(project, manifest);

      try {
        new Function(entryInfo.code);

        return {
          ok: true,
          command,
          projectName: project.name,
          output: `PASS JS syntax looks valid:\n${entryInfo.entry}`
        };
      } catch (error) {
        return {
          ok: false,
          command,
          projectName: project.name,
          error: error.message,
          output: `FAIL JS syntax check failed:\n${entryInfo.entry}\n\n${error.stack || error.message}`
        };
      }
    }

    if (command === 'run') {
      const entryInfo = qDevGetProjectEntryFile(project, manifest);
      const output = qDevRunStarterInSandbox(entryInfo);

      return {
        ok: true,
        command,
        projectName: project.name,
        output
      };
    }

    return {
      ok: false,
      error: `Command not handled: ${command}`
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      output: error.stack || error.message
    };
  }
});


function qDevNormalizeEditablePath(relativePath = '') {
  const normalized = String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim();

  if (!normalized) {
    throw new Error('No file selected.');
  }

  if (normalized.includes('\0') || normalized.split('/').includes('..')) {
    throw new Error('Unsafe file path.');
  }

  return normalized;
}

function qDevEditablePathIsAllowed(relativePath) {
  if (['quartz.json', 'README.md', 'CHANGELOG.md'].includes(relativePath)) {
    return true;
  }

  if (!relativePath.startsWith('payload/')) {
    return false;
  }

  const allowedExtensions = new Set([
    '.js',
    '.json',
    '.md',
    '.txt',
    '.css',
    '.html'
  ]);

  return allowedExtensions.has(path.extname(relativePath).toLowerCase());
}

function qDevGetEditableFilePath(project, relativePath) {
  const normalized = qDevNormalizeEditablePath(relativePath);

  if (!qDevEditablePathIsAllowed(normalized)) {
    throw new Error(`File is not editable from Dev Tools yet: ${normalized}`);
  }

  const filePath = qDevSafeResolve(project.modDir, path.join(project.modDir, normalized));

  return {
    relativePath: normalized,
    filePath
  };
}

function qDevCollectEditableFiles(dir, rootDir, files, state = { count: 0 }) {
  if (!fs.existsSync(dir) || state.count > 220) return;

  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(entry => !qDevIgnoredTreeName(entry.name))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  for (const entry of entries) {
    if (state.count > 220) return;

    const absolute = path.join(dir, entry.name);
    const relative = path.relative(rootDir, absolute).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      qDevCollectEditableFiles(absolute, rootDir, files, state);
      continue;
    }

    if (qDevEditablePathIsAllowed(relative)) {
      files.add(relative);
      state.count += 1;
    }
  }
}

function qDevListEditableFiles(project) {
  const files = new Set();

  const addIfEditableFile = relativePath => {
    try {
      const normalized = qDevNormalizeEditablePath(relativePath);

      if (!qDevEditablePathIsAllowed(normalized)) return;

      const absolute = qDevSafeResolve(project.modDir, path.join(project.modDir, normalized));

      if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
        files.add(normalized);
      }
    } catch {
      // Ignore bad/missing optional files.
    }
  };

  // Always try the manifest entry first, because that is the real mod entry file.
  try {
    const manifest = qDevReadManifest(project.manifestPath);
    addIfEditableFile(manifest.entry || 'payload/main.js');
  } catch {
    addIfEditableFile('payload/main.js');
  }

  const priorityFiles = [
    'payload/main.js',
    'payload/settings.json',
    'quartz.json',
    'README.md',
    'CHANGELOG.md'
  ];

  for (const relativePath of priorityFiles) {
    addIfEditableFile(relativePath);
  }

  qDevCollectEditableFiles(path.join(project.modDir, 'payload'), project.modDir, files);

  return [...files]
    .filter(relativePath => {
      const absolute = path.join(project.modDir, relativePath);
      return fs.existsSync(absolute) && fs.statSync(absolute).isFile();
    })
    .map(relativePath => {
      const absolute = path.join(project.modDir, relativePath);
      const stat = fs.statSync(absolute);

      return {
        relativePath,
        label: relativePath,
        size: stat.size,
        mtimeMs: stat.mtimeMs
      };
    })
    .sort((a, b) => {
      const order = ['payload/main.js', 'quartz.json', 'payload/settings.json', 'README.md', 'CHANGELOG.md'];
      const aIndex = order.indexOf(a.relativePath);
      const bIndex = order.indexOf(b.relativePath);

      if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      }

      return a.relativePath.localeCompare(b.relativePath);
    });
}

ipcMain.handle('dev-list-editable-files' , async (_event, projectName = '') => {
  try {
    const project = qDevResolveWorkspaceProject(projectName);

    if (!project) {
      return {
        ok: false,
        error: 'No dev project selected. Create or select a project first.',
        files: []
      };
    }

    return {
      ok: true,
      projectName: project.name,
      modDir: project.modDir,
      files: qDevListEditableFiles(project)
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      files: []
    };
  }
});

ipcMain.handle('dev-read-project-file', async (_event, projectName = '', relativePath = '') => {
  try {
    const project = qDevResolveWorkspaceProject(projectName);

    if (!project) {
      return {
        ok: false,
        error: 'No dev project selected. Create or select a project first.'
      };
    }

    const editable = qDevGetEditableFilePath(project, relativePath);

    if (!fs.existsSync(editable.filePath) || !fs.statSync(editable.filePath).isFile()) {
      return {
        ok: false,
        error: `File does not exist: ${editable.relativePath}`
      };
    }

    return {
      ok: true,
      projectName: project.name,
      relativePath: editable.relativePath,
      filePath: editable.filePath,
      content: fs.readFileSync(editable.filePath, 'utf8')
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});

ipcMain.handle('dev-write-project-file', async (_event, projectName = '', relativePath = '', content = '') => {
  try {
    const project = qDevResolveWorkspaceProject(projectName);

    if (!project) {
      return {
        ok: false,
        error: 'No dev project selected. Create or select a project first.'
      };
    }

    const editable = qDevGetEditableFilePath(project, relativePath);
    const nextContent = String(content ?? '');

    if (!fs.existsSync(editable.filePath) || !fs.statSync(editable.filePath).isFile()) {
      return {
        ok: false,
        error: `File does not exist: ${editable.relativePath}`
      };
    }

    if (Buffer.byteLength(nextContent, 'utf8') > 512 * 1024) {
      return {
        ok: false,
        error: 'File is too large for the built-in editor.'
      };
    }

    if (editable.relativePath.endsWith('.json')) {
      try {
        JSON.parse(nextContent);
      } catch (error) {
        return {
          ok: false,
          error: `JSON is not valid: ${error.message}`
        };
      }
    }

    fs.writeFileSync(editable.filePath, nextContent, 'utf8');

    const stat = fs.statSync(editable.filePath);

    return {
      ok: true,
      projectName: project.name,
      relativePath: editable.relativePath,
      filePath: editable.filePath,
      size: stat.size,
      message: `Saved ${editable.relativePath}`
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});


function qDevCollectProjectSourceStats(dir, rootDir, state = { latestMtimeMs: 0, fileCount: 0 }) {
  if (!fs.existsSync(dir)) return state;

  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(entry => !qDevIgnoredTreeName(entry.name));

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    const relative = path.relative(rootDir, absolute).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      qDevCollectProjectSourceStats(absolute, rootDir, state);
      continue;
    }

    if (entry.isFile() && qDevEditablePathIsAllowed(relative)) {
      const stat = fs.statSync(absolute);
      state.fileCount += 1;
      state.latestMtimeMs = Math.max(state.latestMtimeMs, stat.mtimeMs);
    }
  }

  return state;
}

function qDevFormatStatusTime(ms) {
  if (!ms) return 'never';
  return new Date(ms).toLocaleString();
}

function qDevGetProjectStatus(projectName = '') {
  const project = qDevResolveWorkspaceProject(projectName);

  if (!project) {
    return {
      ok: false,
      error: 'No dev project selected. Create or select a project first.',
      workspaceDir: qGetDevWorkspaceDir()
    };
  }

  const manifest = qDevReadManifest(project.manifestPath);
  const editableFiles = qDevListEditableFiles(project);
  const sourceStats = qDevCollectProjectSourceStats(project.modDir, project.modDir);

  let packagePath = '';
  let packageExists = false;
  let packageMtimeMs = 0;
  let buildState = 'missing';

  try {
    packagePath = path.join(qGetDevBuildsDir(), qDevPackageFileName(manifest));
    packageExists = fs.existsSync(packagePath);

    if (packageExists) {
      packageMtimeMs = fs.statSync(packagePath).mtimeMs;
      buildState = packageMtimeMs >= sourceStats.latestMtimeMs ? 'fresh' : 'outdated';
    }
  } catch {
    packagePath = '';
    packageExists = false;
    packageMtimeMs = 0;
    buildState = 'missing';
  }

  let entryExists = false;
  let entryPath = '';

  try {
    const entryInfo = qDevGetProjectEntryFile(project, manifest);
    entryExists = true;
    entryPath = entryInfo.entryPath;
  } catch {
    entryExists = false;
    entryPath = '';
  }

  return {
    ok: true,
    projectName: project.name,
    modDir: project.modDir,
    manifestPath: project.manifestPath,
    id: manifest.id || '',
    name: manifest.name || project.name,
    version: manifest.version || '',
    engine: manifest.engine || '',
    entry: manifest.entry || 'payload/main.js',
    entryExists,
    entryPath,
    editableFileCount: editableFiles.length,
    sourceFileCount: sourceStats.fileCount,
    sourceLatestMtimeMs: sourceStats.latestMtimeMs,
    sourceLatestTime: qDevFormatStatusTime(sourceStats.latestMtimeMs),
    packagePath,
    packageExists,
    packageMtimeMs,
    packageTime: qDevFormatStatusTime(packageMtimeMs),
    buildState
  };
}

function qDevFormatProjectStatus(status) {
  if (!status?.ok) {
    return status?.error || 'Project status failed.';
  }

  const buildLine = status.buildState === 'fresh'
    ? 'Build: fresh / up to date'
    : status.buildState === 'outdated'
      ? 'Build: OUTDATED — source files changed after the latest package build'
      : 'Build: missing — build this project';

  return [
    `Project: ${status.projectName}`,
    `Name: ${status.name}`,
    `ID: ${status.id}`,
    `Version: ${status.version}`,
    `Engine: ${status.engine}`,
    `Entry: ${status.entry} ${status.entryExists ? '(found)' : '(missing)'}`,
    `Editable files: ${status.editableFileCount}`,
    `Source files tracked: ${status.sourceFileCount}`,
    `Latest source edit: ${status.sourceLatestTime}`,
    buildLine,
    `Latest build: ${status.packageExists ? status.packagePath : '(none yet)'}`,
    `Latest build time: ${status.packageTime}`,
    `Project folder: ${status.modDir}`
  ].join('\n');
}

ipcMain.handle('dev-get-project-status', async (_event, projectName = '') => {
  try {
    const status = qDevGetProjectStatus(projectName);

    return {
      ...status,
      output: qDevFormatProjectStatus(status)
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      output: error.stack || error.message
    };
  }
});


function qDevNormalizeNewProjectFilePath(relativePath = '') {
  let normalized = String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim();

  if (!normalized) {
    throw new Error('Enter a file name, like helpers.js or payload/helpers.js.');
  }

  if (normalized.includes('\0') || normalized.split('/').includes('..')) {
    throw new Error('Unsafe file path.');
  }

  if (!normalized.includes('/')) {
    normalized = `payload/${normalized}`;
  }

  if (!path.extname(normalized)) {
    normalized = `${normalized}.js`;
  }

  if (!normalized.startsWith('payload/')) {
    throw new Error('New files must be created inside payload/ for now.');
  }

  if (!qDevEditablePathIsAllowed(normalized)) {
    throw new Error(`This file type is not editable yet: ${normalized}`);
  }

  return normalized;
}

function qDevStarterContentForNewFile(relativePath) {
  const ext = path.extname(relativePath).toLowerCase();
  const base = path.basename(relativePath);
  const NL = String.fromCharCode(10);

  if (ext === '.js') {
    return [
      "'use strict';",
      "",
      `// ${base}`,
      "// Add helper code here.",
      "",
      "module.exports = {};",
      ""
    ].join(NL);
  }

  if (ext === '.json') {
    return [
      "{",
      "  \"enabled\": true",
      "}",
      ""
    ].join(NL);
  }

  if (ext === '.md') {
    return [
      `# ${base}`,
      "",
      "Notes for this Quartz mod file.",
      ""
    ].join(NL);
  }

  return "";
}

ipcMain.handle('dev-create-project-file', async (_event, projectName = '', relativePath = '') => {
  try {
    const project = qDevResolveWorkspaceProject(projectName);

    if (!project) {
      return {
        ok: false,
        error: 'No dev project selected. Create or select a project first.'
      };
    }

    const normalized = qDevNormalizeNewProjectFilePath(relativePath);
    const editable = qDevGetEditableFilePath(project, normalized);

    if (fs.existsSync(editable.filePath)) {
      return {
        ok: false,
        error: `File already exists: ${editable.relativePath}`
      };
    }

    fs.mkdirSync(path.dirname(editable.filePath), { recursive: true });
    fs.writeFileSync(editable.filePath, qDevStarterContentForNewFile(editable.relativePath), 'utf8');

    const stat = fs.statSync(editable.filePath);

    return {
      ok: true,
      projectName: project.name,
      relativePath: editable.relativePath,
      filePath: editable.filePath,
      size: stat.size,
      message: `Created ${editable.relativePath}`
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});


function qGetDevSubmissionsDir() {
  return path.join(qGetDevWorkspaceDir(), 'submissions');
}

function qDevSubmissionTimestamp() {
  return new Date()
    .toISOString()
    .replace(/\.\d+Z$/, '')
    .replace(/[:T]/g, '-');
}

function qDevValidatePackageForSubmission(packagePath) {
  const lines = [];
  const errors = [];
  const warnings = [];

  const pass = message => lines.push(`PASS  ${message}`);
  const warn = message => {
    warnings.push(message);
    lines.push(`WARN  ${message}`);
  };
  const fail = message => {
    errors.push(message);
    lines.push(`FAIL  ${message}`);
  };

  let zip = null;
  let manifest = null;

  if (String(packagePath).toLowerCase().endsWith('.quartz')) {
    pass('File extension is .quartz');
  } else {
    fail('File extension must be .quartz');
  }

  if (!fs.existsSync(packagePath)) {
    fail('Package file does not exist');
    return {
      ok: false,
      status: 1,
      output: `${lines.join('\n')}\n\nValidation finished with ${errors.length} error(s), ${warnings.length} warning(s).`,
      error: errors.join('\n'),
      errors,
      warnings,
      manifest: null
    };
  }

  try {
    zip = new AdmZip(packagePath);
    zip.getEntries();
    pass('Package is a readable ZIP archive');
  } catch (error) {
    fail(`Package is not a readable ZIP archive: ${error.message}`);
  }

  if (!zip) {
    return {
      ok: false,
      status: 1,
      output: `${lines.join('\n')}\n\nValidation finished with ${errors.length} error(s), ${warnings.length} warning(s).`,
      error: errors.join('\n'),
      errors,
      warnings,
      manifest: null
    };
  }

  const manifestEntry = zip.getEntry('quartz.json');

  if (manifestEntry) {
    pass('Found quartz.json');
  } else {
    fail('Missing quartz.json');
  }

  if (manifestEntry) {
    try {
      manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
      pass('quartz.json is valid JSON');
    } catch (error) {
      fail(`quartz.json is not valid JSON: ${error.message}`);
    }
  }

  const requiredFields = [
    'format',
    'formatVersion',
    'id',
    'name',
    'version',
    'engine'
  ];

  if (manifest) {
    for (const field of requiredFields) {
      if (manifest[field] === undefined || manifest[field] === null || manifest[field] === '') {
        fail(`Required field missing: ${field}`);
      } else {
        pass(`Required field exists: ${field}`);
      }
    }

    if (manifest.format === 'quartz.package') {
      pass('format is quartz.package');
    } else {
      fail('format must be quartz.package');
    }

    if (manifest.formatVersion === 1) {
      pass('formatVersion is 1');
    } else {
      fail('formatVersion must be 1');
    }

    const validEngines = new Set(['quartz-native', 'geode-compat']);

    if (validEngines.has(manifest.engine)) {
      pass(`Engine is valid: ${manifest.engine}`);
    } else {
      fail(`Engine is not valid: ${manifest.engine}`);
    }

    if (/^[a-z0-9][a-z0-9._-]{1,80}$/i.test(String(manifest.id || ''))) {
      pass('id format looks safe');
    } else {
      fail('id format is not safe');
    }

    if (manifest.engine === 'quartz-native') {
      const entry = String(manifest.entry || '');

      if (!entry) {
        fail('quartz-native package needs entry field');
      } else if (path.isAbsolute(entry) || entry.includes('..')) {
        fail('entry must be a safe relative path');
      } else if (zip.getEntry(entry)) {
        pass(`quartz-native entry exists: ${entry}`);
      } else {
        fail(`quartz-native entry is missing: ${entry}`);
      }
    }

    if (Array.isArray(manifest.dependencies)) {
      pass('dependencies is an array');
    } else {
      fail('dependencies must be an array');
    }

    if (Array.isArray(manifest.permissions)) {
      pass('permissions is an array');
    } else {
      fail('permissions must be an array');
    }

    if (!manifest.description) {
      warn('description is empty');
    }

    if (!manifest.author) {
      warn('author is empty');
    }
  }

  const output = `${lines.join('\n')}\n\nValidation finished with ${errors.length} error(s), ${warnings.length} warning(s).`;

  return {
    ok: errors.length === 0,
    status: errors.length ? 1 : 0,
    output,
    error: errors.length ? errors.join('\n') : null,
    errors,
    warnings,
    manifest
  };
}

ipcMain.handle('dev-prepare-submission', async (_event, projectName = '') => {
  try {
    const project = qDevResolveWorkspaceProject(projectName);

    if (!project) {
      return {
        ok: false,
        error: 'No dev project selected. Create or select a project first.'
      };
    }

    const manifest = qDevReadManifest(project.manifestPath);

    fs.mkdirSync(qGetDevBuildsDir(), { recursive: true });
    fs.mkdirSync(qGetDevSubmissionsDir(), { recursive: true });

    const packagePath = path.join(qGetDevBuildsDir(), qDevPackageFileName(manifest));

    qDevBuildPackageFromFolder(project.modDir, packagePath);

    const validation = qDevValidatePackageForSubmission(packagePath);

    if (!validation.ok) {
      return {
        ok: false,
        projectName: project.name,
        packagePath,
        validation,
        error: 'Submission blocked because validation failed.',
        output: [
          `Submission blocked for ${project.name}.`,
          '',
          `Package: ${packagePath}`,
          '',
          'Validation:',
          validation.output
        ].join('\n')
      };
    }

    const submissionBaseName = `${qDevSlug(manifest.id || project.name)}-${qDevSubmissionTimestamp()}`;
    let submissionDir = path.join(qGetDevSubmissionsDir(), submissionBaseName);
    let counter = 2;

    while (fs.existsSync(submissionDir)) {
      submissionDir = path.join(qGetDevSubmissionsDir(), `${submissionBaseName}-${counter}`);
      counter += 1;
    }

    fs.mkdirSync(submissionDir, { recursive: true });

    const packageName = path.basename(packagePath);
    const submissionPackagePath = path.join(submissionDir, packageName);

    fs.copyFileSync(packagePath, submissionPackagePath);

    const packageStat = fs.statSync(submissionPackagePath);

    const submission = {
      format: 'quartz.submission',
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      projectName: project.name,
      projectFolder: project.modDir,
      packageName,
      packagePath: submissionPackagePath,
      packageSize: packageStat.size,
      manifest,
      validation: {
        ok: validation.ok,
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length
      },
      reviewStatus: 'pending'
    };

    fs.writeFileSync(
      path.join(submissionDir, 'submission.json'),
      JSON.stringify(submission, null, 2) + String.fromCharCode(10),
      'utf8'
    );

    fs.writeFileSync(
      path.join(submissionDir, 'validation-report.txt'),
      validation.output + String.fromCharCode(10),
      'utf8'
    );

    const openResult = await shell.openPath(submissionDir);

    return {
      ok: true,
      projectName: project.name,
      submissionDir,
      packagePath: submissionPackagePath,
      validation,
      openResult,
      message: `Prepared submission for ${project.name}`,
      output: [
        `Prepared submission for ${project.name}`,
        '',
        `Submission folder: ${submissionDir}`,
        `Package: ${submissionPackagePath}`,
        '',
        'Files created:',
        '- submission.json',
        '- validation-report.txt',
        `- ${packageName}`,
        '',
        'Validation:',
        validation.output
      ].join('\n')
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      output: error.stack || error.message
    };
  }
});

// ===== Quartz Developer Tools END =====


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


// ===== Quartz Remote Geode Download Install START =====

function qSafeRemoteCacheName(value, ext) {
  const base = String(value || 'unknown-package')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown-package';

  return `${base}${ext}`;
}

function qRemoteCacheDir() {
  const dir = path.join(app.getPath('userData'), 'cache', 'remote-geode');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function qRemoteGeodeDownloadUrl(mod) {
  return (
    mod.geodeDownloadUrl ||
    mod.downloadUrl ||
    mod.packageUrl ||
    mod.fileUrl ||
    mod.url ||
    mod.links?.download ||
    mod.links?.geode ||
    mod.links?.package ||
    null
  );
}


async function qDownloadBuffer(url) {
  if (!url) {
    throw new Error('Missing download URL.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'QuartzLauncher/0.1',
        'Accept': 'application/octet-stream,*/*'
      }
    });

    if (!response.ok) {
      throw new Error(`Download failed with HTTP ${response.status}: ${url}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!buffer.length) {
      throw new Error(`Downloaded file was empty: ${url}`);
    }

    return buffer;
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error(`Download timed out after 60 seconds: ${url}`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function qWrapRemoteGeodeAsQuartz(mod) {
  const AdmZip = require('adm-zip');

  const packageId = mod.id || mod.packageId || mod.modId;
  const downloadUrl = qRemoteGeodeDownloadUrl(mod);

  if (!packageId) {
    throw new Error('Remote package is missing an id.');
  }

  if (!downloadUrl) {
    throw new Error(`Remote Geode package is missing download URL: ${packageId}`);
  }

  const cacheDir = qRemoteCacheDir();
  const geodePath = path.join(cacheDir, qSafeRemoteCacheName(packageId, '.geode'));
  const quartzPath = path.join(cacheDir, qSafeRemoteCacheName(packageId, '.quartz'));

  const geodeBuffer = await qDownloadBuffer(downloadUrl);
  fs.writeFileSync(geodePath, geodeBuffer);

  const manifest = {
    format: 'quartz.package',
    formatVersion: 1,
    id: packageId,
    name: mod.name || packageId,
    developer: mod.developer || mod.author || 'Unknown',
    version: String(mod.version || mod.latestVersion || '0.0.0'),
    engine: 'geode-compat',
    category: mod.category || 'Geode Compatibility',
    description: mod.description || '',
    payload: 'payload/mod.geode',
    installAs: `${packageId}.geode`,
    tags: Array.isArray(mod.tags) ? mod.tags : ['Geode Compatibility'],
    game: mod.game || 'geometry-dash',
    gameVersion: mod.gameVersion || '*',
    dependencies: Array.isArray(mod.dependencies) ? mod.dependencies : [],
    permissions: Array.isArray(mod.permissions) ? mod.permissions : [],
    source: {
      type: 'remote-geode',
      url: downloadUrl
    }
  };

  const zip = new AdmZip();
  zip.addFile('quartz.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
  zip.addFile('payload/mod.geode', geodeBuffer);
  zip.writeZip(quartzPath);

  return quartzPath;
}

ipcMain.handle('install-quartz-package', async (event, packageId) => {
  try {
    qEnsureEnableFolders();

    const mod = qFindAvailableQuartzPackage(packageId);

    if (!mod) {
      return {
        ok: false,
        error: `Quartz package not found: ${packageId}`
      };
    }

    const modId = mod.id || packageId;

    const isRemoteGeode =
      mod.installMode === 'download-and-wrap-geode' ||
      mod.sourceType === 'remote-geode' ||
      mod.remote === true;

    let quartzPackagePathForValidation = null;

    if (isRemoteGeode) {
      quartzPackagePathForValidation = await qWrapRemoteGeodeAsQuartz({
        ...mod,
        id: modId
      });
    } else {
      quartzPackagePathForValidation =
        mod.packagePath ||
        mod.path ||
        mod.filePath ||
        mod.sourcePath;
    }

    if (!quartzPackagePathForValidation || !fs.existsSync(quartzPackagePathForValidation)) {
      return {
        ok: false,
        error: `Package file does not exist: ${quartzPackagePathForValidation || 'unknown'}`,
        packageId: modId
      };
    }

    const validationResult = qValidateQuartzBeforeUse(quartzPackagePathForValidation, 'install');

    if (!validationResult.ok) {
      return validationResult;
    }

    const dest = qLibraryPackagePath(modId);
    fs.copyFileSync(quartzPackagePathForValidation, dest);

    const enabledMod = qEnableQuartzMod(modId);

    let runtimeSyncResult = null;

    try {
      runtimeSyncResult = qBuildRuntimeManifest();
    } catch (syncError) {
      console.warn('[Quartz Install] runtime sync failed:', syncError.message || syncError);
    }

    return {
      ok: true,
      installed: true,
      enabled: true,
      runtimeSynced: !!runtimeSyncResult,
      runtime: runtimeSyncResult,
      quartzLibraryDir: QUARTZ_NATIVE_LIBRARY_DIR,
      quartzEnabledDir: QUARTZ_NATIVE_ENABLED_DIR,
      mod: enabledMod
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || String(error)
    };
  }
});

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
    const indexListResult = await qListAvailableQuartzPackagesForIndexDisplay();
    const allMods = indexListResult.mods.map(mod => ({
      ...mod,
      enabled: mod.installed ? qIsQuartzModEnabled(mod.id) : false
    }));
    const installedMods = allMods.filter(mod => mod.installed);
    const availableMods = allMods.filter(mod => !mod.installed);

    // Important:
    // Return the full public index to the renderer.
    // The renderer is responsible for hiding installed mods using getInstalledMods().
    // This prevents the Index from accidentally thinking all 900+ mods are installed.
    const filtered = qFilterQuartzPackages(allMods, {
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
          allInstalled: allMods.length > 0 && availableMods.length === 0,
          source: indexListResult.source || paged.meta.source,
          liveIndexUrl: QUARTZ_PUBLIC_INDEX_URL,
          fallbackError: indexListResult.error || null
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
  const allowedEngines = new Set([
    'quartz-native',
    'quartz-resource',
    'geode-compat'
  ]);

  const errors = [];
  const warnings = [];
  const passes = [];

  const fail = (message) => errors.push(`ERROR ${message}`);
  const warn = (message) => warnings.push(`WARN  ${message}`);
  const pass = (message) => passes.push(`PASS  ${message}`);

  try {
    if (!packagePath || !fs.existsSync(packagePath)) {
      fail(`File does not exist: ${packagePath || 'unknown'}`);
      return {
        ok: false,
        status: 1,
        output: [...passes, ...warnings, ...errors].join('\n'),
        error: errors.join('\n')
      };
    }

    if (path.extname(packagePath) !== '.quartz') {
      warn('File extension is not .quartz');
    } else {
      pass('File extension is .quartz');
    }

    let zip;
    try {
      zip = new AdmZip(packagePath);
      zip.getEntries();
      pass('Package is a readable ZIP archive');
    } catch (error) {
      fail(`Could not read ZIP archive: ${error.message}`);
      return {
        ok: false,
        status: 1,
        output: [...passes, ...warnings, ...errors].join('\n'),
        error: errors.join('\n')
      };
    }

    const hasFile = (filePath) => !!zip.getEntry(filePath);
    const manifestEntry = zip.getEntry('quartz.json');

    if (!manifestEntry) {
      fail('Missing required quartz.json');
      return {
        ok: false,
        status: 1,
        output: [...passes, ...warnings, ...errors].join('\n'),
        error: errors.join('\n')
      };
    }

    pass('Found quartz.json');

    let manifest;
    try {
      manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
      pass('quartz.json is valid JSON');
    } catch (error) {
      fail(`quartz.json is invalid JSON: ${error.message}`);
      return {
        ok: false,
        status: 1,
        output: [...passes, ...warnings, ...errors].join('\n'),
        error: errors.join('\n')
      };
    }

    const required = [
      'format',
      'formatVersion',
      'id',
      'name',
      'version',
      'engine'
    ];

    for (const key of required) {
      if (manifest[key] === undefined || manifest[key] === null || manifest[key] === '') {
        fail(`Missing required field: ${key}`);
      } else {
        pass(`Required field exists: ${key}`);
      }
    }

    if (manifest.format !== 'quartz.package') {
      fail(`format should be quartz.package, got: ${manifest.format}`);
    } else {
      pass('format is quartz.package');
    }

    if (manifest.formatVersion !== 1) {
      warn(`formatVersion is expected to be 1, got: ${manifest.formatVersion}`);
    } else {
      pass('formatVersion is 1');
    }

    if (!allowedEngines.has(manifest.engine)) {
      fail(`Invalid engine: ${manifest.engine}`);
    } else {
      pass(`Engine is valid: ${manifest.engine}`);
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(String(manifest.id || ''))) {
      fail('id should only use letters, numbers, dots, underscores, and dashes');
    } else {
      pass('id format looks safe');
    }

    if (manifest.engine === 'quartz-native') {
      if (!manifest.entry) {
        fail('quartz-native package is missing entry');
      } else if (!hasFile(manifest.entry)) {
        fail(`quartz-native entry file is missing: ${manifest.entry}`);
      } else {
        pass(`quartz-native entry exists: ${manifest.entry}`);
      }
    }

    if (manifest.engine === 'geode-compat') {
      const payload = manifest.payload || manifest.entry;

      if (!payload) {
        warn('geode-compat package has no payload field');
      } else if (!hasFile(payload)) {
        fail(`geode-compat payload file is missing: ${payload}`);
      } else {
        pass(`geode-compat payload exists: ${payload}`);
      }
    }

    if (!Array.isArray(manifest.dependencies)) {
      warn('dependencies should be an array');
    } else {
      pass('dependencies is an array');
    }

    if (!Array.isArray(manifest.permissions)) {
      warn('permissions should be an array');
    } else {
      pass('permissions is an array');
    }

    const output = [
      ...passes,
      ...warnings,
      ...errors,
      '',
      `Validation finished with ${errors.length} error(s), ${warnings.length} warning(s).`
    ].join('\n');

    return {
      ok: errors.length === 0,
      status: errors.length === 0 ? 0 : 1,
      output,
      error: errors.length ? errors.join('\n') : null
    };
  } catch (error) {
    return {
      ok: false,
      status: 1,
      output: '',
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


ipcMain.handle('sync-geode-index', async () => {
  try {
    const { spawn } = require('child_process');

    const scriptPath = path.join(__dirname, 'tools', 'sync-geode-index-to-quartz.js');

    if (!fs.existsSync(scriptPath)) {
      return {
        ok: false,
        error: `Sync tool not found: ${scriptPath}`
      };
    }

    const nodeBin = process.env.npm_node_execpath || 'node';

    const result = await new Promise((resolve) => {
      const child = spawn(nodeBin, [scriptPath], {
        cwd: __dirname,
        env: process.env
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', chunk => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', chunk => {
        stderr += chunk.toString();
      });

      child.on('error', error => {
        resolve({
          ok: false,
          error: error.message || String(error),
          stdout,
          stderr
        });
      });

      child.on('close', code => {
        resolve({
          ok: code === 0,
          code,
          stdout,
          stderr,
          error: code === 0 ? null : (stderr || stdout || `Sync exited with code ${code}`)
        });
      });
    });

    return result;
  } catch (error) {
    return {
      ok: false,
      error: error.message || String(error)
    };
  }
});

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

// ===== Quartz Remote Index Display Override START =====
// This override lets the Index show local Quartz packages AND remote Geode compatibility entries.
// Remote entries are displayed in the Index now. Install/download wrapping is wired in a later patch.

const QUARTZ_PUBLIC_SITE_BASE_URL = 'https://quartz-launcher.pages.dev';
const QUARTZ_PUBLIC_INDEX_URL = `${QUARTZ_PUBLIC_SITE_BASE_URL}/assets/index/quartz-index.json`;

function qExtractQuartzIndexEntries(raw) {
  if (Array.isArray(raw)) {
    return raw;
  }

  if (Array.isArray(raw?.packages)) {
    return raw.packages;
  }

  if (Array.isArray(raw?.mods)) {
    return raw.mods;
  }

  return [];
}

function qFetchText(url, timeoutMs = 8000, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    let parsed;

    try {
      parsed = new URL(url);
    } catch (error) {
      reject(error);
      return;
    }

    const client = parsed.protocol === 'http:' ? require('http') : require('https');

    const request = client.get(parsed, {
      headers: {
        'Accept': 'application/json,text/plain,*/*',
        'User-Agent': 'QuartzLauncher'
      }
    }, response => {
      const statusCode = Number(response.statusCode || 0);
      const location = response.headers.location;

      if (statusCode >= 300 && statusCode < 400 && location && redirectsLeft > 0) {
        response.resume();
        const nextUrl = new URL(location, parsed).toString();
        qFetchText(nextUrl, timeoutMs, redirectsLeft - 1).then(resolve, reject);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`HTTP ${statusCode}`));
        return;
      }

      response.setEncoding('utf8');

      let body = '';

      response.on('data', chunk => {
        body += chunk;
      });

      response.on('end', () => {
        resolve(body);
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timed out after ${timeoutMs}ms`));
    });

    request.on('error', reject);
  });
}

function qLoadQuartzIndexEntriesForDisplay() {
  const indexPath = path.join(__dirname, 'assets', 'index', 'quartz-index.json');

  if (!fs.existsSync(indexPath)) {
    return [];
  }

  try {
    const raw = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

    return qExtractQuartzIndexEntries(raw).map(entry => ({
      ...entry,
      indexSource: entry.indexSource || 'local'
    }));
  } catch (error) {
    console.warn('Failed to read Quartz index:', error.message);
    return [];
  }
}

async function qLoadQuartzIndexEntriesForDisplayAsync() {
  try {
    const text = await qFetchText(QUARTZ_PUBLIC_INDEX_URL);
    const raw = JSON.parse(text);
    const entries = qExtractQuartzIndexEntries(raw).map(entry => ({
      ...entry,
      indexSource: 'website',
      indexBaseUrl: QUARTZ_PUBLIC_SITE_BASE_URL
    }));

    return {
      entries,
      source: 'website',
      error: null
    };
  } catch (error) {
    const entries = qLoadQuartzIndexEntriesForDisplay();

    return {
      entries,
      source: 'local-fallback',
      error: error.message || String(error)
    };
  }
}

function qGetQuartzIndexPackageRawPath(entry) {
  return (
    entry.packagePath ||
    entry.path ||
    entry.filePath ||
    entry.sourcePath ||
    null
  );
}

function qResolveQuartzIndexPackageUrl(entry) {
  const rawPath = qGetQuartzIndexPackageRawPath(entry);

  if (entry.packageUrl || entry.downloadUrl) {
    return entry.packageUrl || entry.downloadUrl;
  }

  if (!rawPath) {
    return null;
  }

  if (/^https?:\/\//i.test(rawPath)) {
    return rawPath;
  }

  if (entry.indexSource === 'website') {
    return new URL(String(rawPath).replace(/^\/+/, ''), `${QUARTZ_PUBLIC_SITE_BASE_URL}/`).toString();
  }

  return null;
}

function qResolveLocalQuartzIndexPackagePath(entry) {
  const rawPath = qGetQuartzIndexPackageRawPath(entry);

  if (!rawPath) {
    return null;
  }

  if (/^https?:\/\//i.test(rawPath)) {
    return null;
  }

  if (entry.indexSource === 'website') {
    return null;
  }

  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }

  return path.join(__dirname, rawPath);
}

function qNormalizeQuartzIndexEntryForDisplay(entry) {
  const id = String(entry.id || '').trim();

  if (!id) {
    return null;
  }

  const installMode =
    entry.installMode ||
    (entry.geodeDownloadUrl ? 'download-and-wrap-geode' : 'local-quartz-package');

  const isRemoteGeode =
    installMode === 'download-and-wrap-geode' ||
    entry.sourceType === 'remote-geode' ||
    !!entry.geodeDownloadUrl;

  const packagePath = isRemoteGeode
    ? null
    : qResolveLocalQuartzIndexPackagePath(entry);

  const packageUrl = isRemoteGeode
    ? entry.geodeDownloadUrl || entry.downloadUrl || null
    : qResolveQuartzIndexPackageUrl(entry);

  const installed = fs.existsSync(qLibraryPackagePath(id));

  return {
    id,
    name: entry.name || id,
    developer: entry.developer || entry.author || 'Unknown',
    version: entry.version || entry.modVersion || 'unknown',
    description: entry.description || 'No description provided.',
    engine: entry.engine || (isRemoteGeode ? 'geode-compat' : 'quartz-resource'),
    category: entry.category || (isRemoteGeode ? 'Geode' : 'Quartz'),
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    source: entry.source || (isRemoteGeode ? 'geode-index' : 'local-quartz'),
    sourceType: entry.sourceType || (isRemoteGeode ? 'remote-geode' : 'local-quartz'),
    installMode,
    remote: isRemoteGeode,
    geodeModId: entry.geodeModId || (isRemoteGeode ? id : null),
    geodeDownloadUrl: entry.geodeDownloadUrl || null,
    geodeHash: entry.geodeHash || null,
    downloadCount: entry.downloadCount || 0,
    featured: !!entry.featured,
    featuredRank: Number.isFinite(Number(entry.featuredRank)) ? Number(entry.featuredRank) : null,
    featuredAt: entry.featuredAt || null,
    gameVersion: entry.gameVersion || null,
    geodeVersion: entry.geodeVersion || null,
    links: entry.links || {},
    updatedAt: entry.updatedAt || null,
    indexSource: entry.indexSource || 'local',
    packagePath,
    packageUrl,
    installed,
    enabled: installed ? qIsQuartzModEnabled(id) : false
  };
}

function qSortQuartzIndexModsForDisplay(mods) {
  return [...mods].sort((a, b) => {
    const aFeatured = !!a.featured;
    const bFeatured = !!b.featured;

    if (aFeatured !== bFeatured) {
      return aFeatured ? -1 : 1;
    }

    if (aFeatured && bFeatured) {
      const aRank = Number.isFinite(Number(a.featuredRank)) ? Number(a.featuredRank) : 999999;
      const bRank = Number.isFinite(Number(b.featuredRank)) ? Number(b.featuredRank) : 999999;

      if (aRank !== bRank) {
        return aRank - bRank;
      }
    }

    return String(a.name || a.id).localeCompare(String(b.name || b.id));
  });
}

function qUniqueQuartzIndexMods(mods) {
  const seen = new Set();
  const unique = [];

  for (const mod of mods) {
    if (seen.has(mod.id)) continue;
    seen.add(mod.id);
    unique.push(mod);
  }

  return unique;
}

function qListAvailableQuartzPackages() {
  qEnsureEnableFolders();

  const entries = qLoadQuartzIndexEntriesForDisplay();

  const mods = entries
    .map(qNormalizeQuartzIndexEntryForDisplay)
    .filter(Boolean);

  return qSortQuartzIndexModsForDisplay(qUniqueQuartzIndexMods(mods));
}

async function qListAvailableQuartzPackagesForIndexDisplay() {
  qEnsureEnableFolders();

  const result = await qLoadQuartzIndexEntriesForDisplayAsync();

  const mods = result.entries
    .map(qNormalizeQuartzIndexEntryForDisplay)
    .filter(Boolean);

  return {
    mods: qSortQuartzIndexModsForDisplay(qUniqueQuartzIndexMods(mods)),
    source: result.source,
    error: result.error
  };
}

function qFindAvailableQuartzPackage(packageId) {
  return qListAvailableQuartzPackages().find((mod) => mod.id === packageId) || null;
}

// ===== Quartz Remote Index Display Override END =====


// ===== Quartz Final Public Index Override START =====
// This MUST stay near the bottom of main.js.
// It guarantees the renderer receives the full public index.
// The renderer is the only layer that hides installed mods.
try {
  ipcMain.removeHandler('get-quartz-index');
} catch {}

ipcMain.handle('get-quartz-index', async (_event, options = {}) => {
  try {
    const safeOptions = {
      ...options,
      category: options.category === 'Installed' ? 'All' : options.category,
      pageSize: Number(options.pageSize || 5000)
    };

    let indexListResult = {
      mods: [],
      source: 'unknown',
      error: null
    };

    if (typeof qListAvailableQuartzPackagesForIndexDisplay === 'function') {
      indexListResult = await qListAvailableQuartzPackagesForIndexDisplay();
    } else if (typeof qAvailableModsWithEnabledState === 'function') {
      indexListResult = {
        mods: qAvailableModsWithEnabledState(),
        source: 'native-library-fallback',
        error: null
      };
    } else if (typeof qListAvailableQuartzPackages === 'function') {
      indexListResult = {
        mods: qListAvailableQuartzPackages(),
        source: 'legacy-library-fallback',
        error: null
      };
    }

    const rawMods = Array.isArray(indexListResult.mods) ? indexListResult.mods : [];

    const allMods = rawMods
      .filter(Boolean)
      .map(mod => {
        const installed = !!mod.installed;

        return {
          ...mod,
          installed,
          enabled: installed && typeof qIsQuartzModEnabled === 'function'
            ? qIsQuartzModEnabled(mod.id)
            : !!mod.enabled
        };
      });

    const installedMods = allMods.filter(mod => mod.installed);
    const availableMods = allMods.filter(mod => !mod.installed);

    const filtered = typeof qFilterQuartzPackages === 'function'
      ? qFilterQuartzPackages(allMods, safeOptions)
      : allMods;

    const paged = typeof qPageQuartzPackages === 'function'
      ? qPageQuartzPackages(filtered, safeOptions)
      : {
          mods: filtered,
          meta: {
            page: 1,
            pageSize: safeOptions.pageSize,
            total: filtered.length,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
            source: indexListResult.source || 'final-public-index'
          }
        };

    return {
      ok: true,
      quartzDataDir: typeof QUARTZ_NATIVE_DATA_DIR !== 'undefined' ? QUARTZ_NATIVE_DATA_DIR : null,
      quartzLibraryDir: typeof QUARTZ_NATIVE_LIBRARY_DIR !== 'undefined' ? QUARTZ_NATIVE_LIBRARY_DIR : null,
      quartzEnabledDir: typeof QUARTZ_NATIVE_ENABLED_DIR !== 'undefined' ? QUARTZ_NATIVE_ENABLED_DIR : null,
      index: {
        mods: paged.mods,
        meta: {
          ...paged.meta,
          allCount: allMods.length,
          installedCount: installedMods.length,
          availableCount: availableMods.length,
          allInstalled: allMods.length > 0 && availableMods.length === 0,
          source: indexListResult.source || paged.meta.source || 'final-public-index',
          backendMode: 'full-public-index-final-override',
          liveIndexUrl: typeof QUARTZ_PUBLIC_INDEX_URL !== 'undefined' ? QUARTZ_PUBLIC_INDEX_URL : null,
          fallbackError: indexListResult.error || null
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
          pageSize: Number(options.pageSize || 5000),
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
          allCount: 0,
          installedCount: 0,
          availableCount: 0,
          allInstalled: false,
          source: 'final-public-index-error',
          backendMode: 'full-public-index-final-override'
        }
      }
    };
  }
});
// ===== Quartz Final Public Index Override END =====


// ===== Quartz Hard Public Index Loader START =====
// Final override: the Index page must receive the real public index.
// This bypasses older stacked get-quartz-index handlers that may return only installed/local mods.
function qHardExtractPublicIndexMods(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.mods)) return raw.mods;
  if (Array.isArray(raw?.packages)) return raw.packages;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
}

function qHardSafeText(value) {
  return String(value || '').trim();
}

function qHardPackageUrl(entry) {
  const raw =
    entry.packageUrl ||
    entry.downloadUrl ||
    entry.downloadURL ||
    entry.url ||
    entry.packageFile ||
    entry.file ||
    '';

  const value = qHardSafeText(raw);

  if (!value) return '';

  if (/^https?:\/\//i.test(value)) return value;

  const base = typeof QUARTZ_PUBLIC_SITE_BASE_URL !== 'undefined'
    ? QUARTZ_PUBLIC_SITE_BASE_URL
    : 'https://quartz-launcher.pages.dev';

  if (value.startsWith('/')) return `${base}${value}`;

  return `${base}/assets/packages/${value}`;
}

function qHardNormalizePublicIndexMod(entry, sourceName = 'public-index') {
  const id = qHardSafeText(entry.id || entry.modId || entry.packageId || entry.slug);
  const name = qHardSafeText(entry.name || entry.title || id);

  if (!id || !name) return null;

  const tags = Array.isArray(entry.tags)
    ? entry.tags.map(tag => qHardSafeText(tag)).filter(Boolean)
    : [];

  const engine =
    qHardSafeText(entry.engine) ||
    qHardSafeText(entry.type) ||
    qHardSafeText(entry.packageType) ||
    'geode-compat';

  return {
    ...entry,
    id,
    name,
    developer: qHardSafeText(entry.developer || entry.author || entry.creator || 'Unknown'),
    version: qHardSafeText(entry.version || '0.0.0'),
    description: qHardSafeText(entry.description || entry.summary || ''),
    category: qHardSafeText(entry.category || 'Utility'),
    tags,
    engine,
    type: engine,
    source: sourceName,
    indexSource: sourceName,
    packageFile: qHardSafeText(entry.packageFile || entry.file || ''),
    packageUrl: qHardPackageUrl(entry),
    installed: false,
    enabled: false,
    featured: !!entry.featured,
    featuredRank: Number.isFinite(Number(entry.featuredRank)) ? Number(entry.featuredRank) : 999999,
    featuredAt: entry.featuredAt || '',
    detailsText: entry.detailsText || entry.readme || entry.about || entry.description || '',
    changelogText: entry.changelogText || entry.changelog || ''
  };
}

function qHardUniqueMods(mods) {
  const byId = new Map();

  for (const mod of mods) {
    if (!mod || !mod.id) continue;

    if (!byId.has(mod.id)) {
      byId.set(mod.id, mod);
      continue;
    }

    const existing = byId.get(mod.id);

    // Prefer featured/live entries when duplicated.
    if ((!existing.featured && mod.featured) || existing.source !== 'live-public-index') {
      byId.set(mod.id, {
        ...existing,
        ...mod
      });
    }
  }

  return [...byId.values()];
}

async function qHardLoadPublicIndexMods() {
  const loaded = [];
  const errors = [];

  const liveUrl = typeof QUARTZ_PUBLIC_INDEX_URL !== 'undefined'
    ? QUARTZ_PUBLIC_INDEX_URL
    : 'https://quartz-launcher.pages.dev/assets/index/quartz-index.json';

  // 1) Live website index first.
  try {
    let text = '';

    if (typeof qFetchText === 'function') {
      text = await qFetchText(liveUrl, 10000);
    } else if (typeof quartzFetchBuffer === 'function') {
      text = (await quartzFetchBuffer(liveUrl)).toString('utf8');
    }

    if (text) {
      const raw = JSON.parse(text);
      loaded.push(...qHardExtractPublicIndexMods(raw).map(entry => qHardNormalizePublicIndexMod(entry, 'live-public-index')).filter(Boolean));
    }
  } catch (error) {
    errors.push(`Live index failed: ${error.message}`);
  }

  // 2) Local website copy.
  for (const item of [
    { file: path.join(__dirname, 'site', 'assets', 'index', 'quartz-index.json'), source: 'site-local-index' },
    { file: path.join(__dirname, 'assets', 'index', 'quartz-index.json'), source: 'app-local-index' },
    { file: path.join(__dirname, 'assets', 'index', 'geode-quartz-index.json'), source: 'geode-local-index' }
  ]) {
    try {
      if (!fs.existsSync(item.file)) continue;

      const raw = JSON.parse(fs.readFileSync(item.file, 'utf8'));
      loaded.push(...qHardExtractPublicIndexMods(raw).map(entry => qHardNormalizePublicIndexMod(entry, item.source)).filter(Boolean));
    } catch (error) {
      errors.push(`${item.source} failed: ${error.message}`);
    }
  }

  const mods = qHardUniqueMods(loaded).sort((a, b) => {
    const af = a.featured ? 1 : 0;
    const bf = b.featured ? 1 : 0;

    if (af !== bf) return bf - af;

    const ar = Number.isFinite(Number(a.featuredRank)) ? Number(a.featuredRank) : 999999;
    const br = Number.isFinite(Number(b.featuredRank)) ? Number(b.featuredRank) : 999999;

    return (ar - br) || String(a.name).localeCompare(String(b.name));
  });

  return {
    mods,
    errors
  };
}

try {
  ipcMain.removeHandler('get-quartz-index');
} catch {}

ipcMain.handle('get-quartz-index', async (_event, options = {}) => {
  try {
    const result = await qHardLoadPublicIndexMods();
    const mods = result.mods;

    return {
      ok: true,
      index: {
        mods,
        errors: result.errors,
        meta: {
          page: 1,
          pageSize: mods.length,
          total: mods.length,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
          allCount: mods.length,
          installedCount: 0,
          availableCount: mods.length,
          allInstalled: false,
          source: 'hard-public-index-loader',
          backendMode: 'hard-public-index-loader',
          liveIndexUrl: typeof QUARTZ_PUBLIC_INDEX_URL !== 'undefined'
            ? QUARTZ_PUBLIC_INDEX_URL
            : 'https://quartz-launcher.pages.dev/assets/index/quartz-index.json',
          fallbackError: result.errors.length ? result.errors.join(' | ') : null
        }
      }
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      index: {
        mods: [],
        errors: [error.message],
        meta: {
          page: 1,
          pageSize: Number(options.pageSize || 5000),
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
          allCount: 0,
          installedCount: 0,
          availableCount: 0,
          allInstalled: false,
          source: 'hard-public-index-loader-error',
          backendMode: 'hard-public-index-loader'
        }
      }
    };
  }
});
// ===== Quartz Hard Public Index Loader END =====


// ===== Quartz Local First Public Index Loader START =====
// Final final override: local public index first, no live network wait.
// This prevents the Index page from getting stuck at "waiting for load".
function qLocalFirstExtractIndexMods(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.mods)) return raw.mods;
  if (Array.isArray(raw?.packages)) return raw.packages;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
}

function qLocalFirstClean(value) {
  return String(value || '').trim();
}

function qLocalFirstPackageUrl(entry) {
  const raw =
    entry.packageUrl ||
    entry.downloadUrl ||
    entry.downloadURL ||
    entry.url ||
    entry.packageFile ||
    entry.file ||
    '';

  const value = qLocalFirstClean(raw);

  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;

  const base = typeof QUARTZ_PUBLIC_SITE_BASE_URL !== 'undefined'
    ? QUARTZ_PUBLIC_SITE_BASE_URL
    : 'https://quartz-launcher.pages.dev';

  if (value.startsWith('/')) return `${base}${value}`;

  return `${base}/assets/packages/${value}`;
}

function qLocalFirstNormalizeMod(entry, sourceName) {
  const id = qLocalFirstClean(entry.id || entry.modId || entry.packageId || entry.slug);
  const name = qLocalFirstClean(entry.name || entry.title || id);

  if (!id || !name) return null;

  const tags = Array.isArray(entry.tags)
    ? entry.tags.map(tag => qLocalFirstClean(tag)).filter(Boolean)
    : [];

  const engine =
    qLocalFirstClean(entry.engine) ||
    qLocalFirstClean(entry.type) ||
    qLocalFirstClean(entry.packageType) ||
    'geode-compat';

  return {
    ...entry,
    id,
    name,
    developer: qLocalFirstClean(entry.developer || entry.author || entry.creator || 'Unknown'),
    version: qLocalFirstClean(entry.version || '0.0.0'),
    description: qLocalFirstClean(entry.description || entry.summary || ''),
    category: qLocalFirstClean(entry.category || 'Utility'),
    tags,
    engine,
    type: engine,
    source: sourceName,
    indexSource: sourceName,
    packageFile: qLocalFirstClean(entry.packageFile || entry.file || ''),
    packageUrl: qLocalFirstPackageUrl(entry),
    installed: false,
    enabled: false,
    featured: !!entry.featured,
    featuredRank: Number.isFinite(Number(entry.featuredRank)) ? Number(entry.featuredRank) : 999999,
    featuredAt: entry.featuredAt || '',
    detailsText: entry.detailsText || entry.readme || entry.about || entry.description || '',
    changelogText: entry.changelogText || entry.changelog || ''
  };
}

function qLocalFirstUniqueMods(mods) {
  const byId = new Map();

  for (const mod of mods) {
    if (!mod || !mod.id) continue;

    if (!byId.has(mod.id)) {
      byId.set(mod.id, mod);
      continue;
    }

    const existing = byId.get(mod.id);

    byId.set(mod.id, {
      ...existing,
      ...mod,
      featured: existing.featured || mod.featured,
      tags: Array.isArray(mod.tags) && mod.tags.length ? mod.tags : existing.tags
    });
  }

  return [...byId.values()];
}

function qLocalFirstLoadPublicIndexMods() {
  const loaded = [];
  const errors = [];

  const candidates = [
    { file: path.join(__dirname, 'site', 'assets', 'index', 'quartz-index.json'), source: 'site-local-index' },
    { file: path.join(__dirname, 'assets', 'index', 'quartz-index.json'), source: 'app-local-index' },
    { file: path.join(__dirname, 'assets', 'index', 'geode-quartz-index.json'), source: 'geode-local-index' }
  ];

  for (const item of candidates) {
    try {
      if (!fs.existsSync(item.file)) {
        errors.push(`${item.source} missing`);
        continue;
      }

      const raw = JSON.parse(fs.readFileSync(item.file, 'utf8'));
      const mods = qLocalFirstExtractIndexMods(raw)
        .map(entry => qLocalFirstNormalizeMod(entry, item.source))
        .filter(Boolean);

      loaded.push(...mods);
      console.log(`[Quartz Local Index] ${item.source}: ${mods.length} mods`);
    } catch (error) {
      errors.push(`${item.source} failed: ${error.message}`);
    }
  }

  const mods = qLocalFirstUniqueMods(loaded).sort((a, b) => {
    const af = a.featured ? 1 : 0;
    const bf = b.featured ? 1 : 0;

    if (af !== bf) return bf - af;

    const ar = Number.isFinite(Number(a.featuredRank)) ? Number(a.featuredRank) : 999999;
    const br = Number.isFinite(Number(b.featuredRank)) ? Number(b.featuredRank) : 999999;

    return (ar - br) || String(a.name).localeCompare(String(b.name));
  });

  return {
    mods,
    errors
  };
}

try {
  ipcMain.removeHandler('get-quartz-index');
} catch {}

ipcMain.handle('get-quartz-index', async (_event, options = {}) => {
  try {
    const result = qLocalFirstLoadPublicIndexMods();
    const mods = result.mods;

    return {
      ok: true,
      index: {
        mods,
        errors: result.errors,
        meta: {
          page: 1,
          pageSize: mods.length,
          total: mods.length,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
          allCount: mods.length,
          installedCount: 0,
          availableCount: mods.length,
          allInstalled: false,
          source: 'local-first-public-index',
          backendMode: 'local-first-public-index',
          liveIndexUrl: typeof QUARTZ_PUBLIC_INDEX_URL !== 'undefined'
            ? QUARTZ_PUBLIC_INDEX_URL
            : 'https://quartz-launcher.pages.dev/assets/index/quartz-index.json',
          fallbackError: result.errors.length ? result.errors.join(' | ') : null
        }
      }
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      index: {
        mods: [],
        errors: [error.message],
        meta: {
          page: 1,
          pageSize: Number(options.pageSize || 5000),
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
          allCount: 0,
          installedCount: 0,
          availableCount: 0,
          allInstalled: false,
          source: 'local-first-public-index-error',
          backendMode: 'local-first-public-index'
        }
      }
    };
  }
});
// ===== Quartz Local First Public Index Loader END =====


// ===== Quartz Clean Public Index IPC START =====
// Dedicated clean channel for the public Index page.
// This avoids older stacked get-quartz-index handlers.
function qCleanPublicIndexFallbackLoad() {
  const loaded = [];
  const errors = [];

  function extract(raw) {
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.mods)) return raw.mods;
    if (Array.isArray(raw?.packages)) return raw.packages;
    if (Array.isArray(raw?.data)) return raw.data;
    if (Array.isArray(raw?.items)) return raw.items;
    return [];
  }

  function clean(value) {
    return String(value || '').trim();
  }

  function packageUrl(entry) {
    const raw =
      entry.packageUrl ||
      entry.downloadUrl ||
      entry.downloadURL ||
      entry.url ||
      entry.packageFile ||
      entry.file ||
      '';

    const value = clean(raw);

    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;

    const base = typeof QUARTZ_PUBLIC_SITE_BASE_URL !== 'undefined'
      ? QUARTZ_PUBLIC_SITE_BASE_URL
      : 'https://quartz-launcher.pages.dev';

    if (value.startsWith('/')) return `${base}${value}`;

    return `${base}/assets/packages/${value}`;
  }

  function normalize(entry, sourceName) {
    const id = clean(entry.id || entry.modId || entry.packageId || entry.slug);
    const name = clean(entry.name || entry.title || id);

    if (!id || !name) return null;

    const tags = Array.isArray(entry.tags)
      ? entry.tags.map(tag => clean(tag)).filter(Boolean)
      : [];

    const engine =
      clean(entry.engine) ||
      clean(entry.type) ||
      clean(entry.packageType) ||
      'geode-compat';

    return {
      ...entry,
      id,
      name,
      developer: clean(entry.developer || entry.author || entry.creator || 'Unknown'),
      version: clean(entry.version || '0.0.0'),
      description: clean(entry.description || entry.summary || ''),
      category: clean(entry.category || 'Utility'),
      tags,
      engine,
      type: engine,
      source: sourceName,
      indexSource: sourceName,
      packageFile: clean(entry.packageFile || entry.file || ''),
      packageUrl: packageUrl(entry),
      installed: false,
      enabled: false,
      featured: !!entry.featured,
      featuredRank: Number.isFinite(Number(entry.featuredRank)) ? Number(entry.featuredRank) : 999999,
      featuredAt: entry.featuredAt || '',
      detailsText: entry.detailsText || entry.readme || entry.about || entry.description || '',
      changelogText: entry.changelogText || entry.changelog || ''
    };
  }

  const candidates = [
    { file: path.join(__dirname, 'site', 'assets', 'index', 'quartz-index.json'), source: 'site-local-index' },
    { file: path.join(__dirname, 'assets', 'index', 'quartz-index.json'), source: 'app-local-index' },
    { file: path.join(__dirname, 'assets', 'index', 'geode-quartz-index.json'), source: 'geode-local-index' }
  ];

  for (const item of candidates) {
    try {
      if (!fs.existsSync(item.file)) {
        errors.push(`${item.source} missing`);
        continue;
      }

      const raw = JSON.parse(fs.readFileSync(item.file, 'utf8'));
      const mods = extract(raw).map(entry => normalize(entry, item.source)).filter(Boolean);

      console.log(`[Quartz Clean Public Index] ${item.source}: ${mods.length} mods`);
      loaded.push(...mods);
    } catch (error) {
      errors.push(`${item.source} failed: ${error.message}`);
    }
  }

  const byId = new Map();

  for (const mod of loaded) {
    if (!mod || !mod.id) continue;

    if (!byId.has(mod.id)) {
      byId.set(mod.id, mod);
      continue;
    }

    const existing = byId.get(mod.id);

    byId.set(mod.id, {
      ...existing,
      ...mod,
      featured: existing.featured || mod.featured,
      tags: Array.isArray(mod.tags) && mod.tags.length ? mod.tags : existing.tags
    });
  }

  const mods = [...byId.values()].sort((a, b) => {
    const af = a.featured ? 1 : 0;
    const bf = b.featured ? 1 : 0;

    if (af !== bf) return bf - af;

    const ar = Number.isFinite(Number(a.featuredRank)) ? Number(a.featuredRank) : 999999;
    const br = Number.isFinite(Number(b.featuredRank)) ? Number(b.featuredRank) : 999999;

    return (ar - br) || String(a.name).localeCompare(String(b.name));
  });

  return { mods, errors };
}

try {
  ipcMain.removeHandler('get-public-index-local');
} catch {}

ipcMain.handle('get-public-index-local', async () => {
  try {
    const result = typeof qLocalFirstLoadPublicIndexMods === 'function'
      ? qLocalFirstLoadPublicIndexMods()
      : qCleanPublicIndexFallbackLoad();

    const mods = Array.isArray(result.mods) ? result.mods : [];

    console.log(`[Quartz Clean Public Index IPC] returning ${mods.length} mods`);

    return {
      ok: true,
      index: {
        mods,
        errors: result.errors || [],
        meta: {
          page: 1,
          pageSize: mods.length,
          total: mods.length,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
          allCount: mods.length,
          installedCount: 0,
          availableCount: mods.length,
          allInstalled: false,
          source: 'clean-public-index-local',
          backendMode: 'clean-public-index-local',
          fallbackError: result.errors && result.errors.length ? result.errors.join(' | ') : null
        }
      }
    };
  } catch (error) {
    console.error('[Quartz Clean Public Index IPC] failed:', error);

    return {
      ok: false,
      error: error.message,
      index: {
        mods: [],
        errors: [error.message],
        meta: {
          page: 1,
          pageSize: 0,
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
          allCount: 0,
          installedCount: 0,
          availableCount: 0,
          allInstalled: false,
          source: 'clean-public-index-local-error',
          backendMode: 'clean-public-index-local'
        }
      }
    };
  }
});
// ===== Quartz Clean Public Index IPC END =====


// ===== Quartz Export Installed Mod List START =====
try {
  ipcMain.removeHandler('export-installed-mod-list');
} catch {}

// ===== Quartz Backup / Restore START =====
// Creates a local folder backup of installed Quartz packages, enabled/disabled states,
// profiles/loadouts, and runtime status files. Restore copies packages/profiles back
// and reapplies saved enabled/disabled states without deleting unrelated current mods.
function qBackupsRootDir() {
  return path.join(app.getPath('desktop') || os.homedir(), 'QuartzLauncherBackups');
}

function qBackupTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function qEnsureBackupsRootDir() {
  const dir = qBackupsRootDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function qBackupReadJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (_) {
    return fallback;
  }
}

function qBackupCopyFileIfExists(src, dest) {
  if (!src || !fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function qBackupCopyDirJsonFiles(srcDir, destDir) {
  let count = 0;
  if (!srcDir || !fs.existsSync(srcDir)) return count;

  fs.mkdirSync(destDir, { recursive: true });

  for (const name of fs.readdirSync(srcDir)) {
    if (!name.toLowerCase().endsWith('.json')) continue;

    const src = path.join(srcDir, name);
    const stat = fs.statSync(src);
    if (!stat.isFile()) continue;

    fs.copyFileSync(src, path.join(destDir, name));
    count += 1;
  }

  return count;
}

function qCreateQuartzBackup() {
  if (typeof qEnsureNativeFolders === 'function') qEnsureNativeFolders();
  if (typeof qEnsureEnableFolders === 'function') qEnsureEnableFolders();
  if (typeof qEnsureProfilesDir === 'function') qEnsureProfilesDir();
  if (typeof qEnsureRuntimeFolders === 'function') qEnsureRuntimeFolders();

  const root = qEnsureBackupsRootDir();
  const backupName = `QuartzBackup-${qBackupTimestamp()}`;
  const backupDir = path.join(root, backupName);

  const packagesDir = path.join(backupDir, 'packages');
  const profilesDir = path.join(backupDir, 'profiles');
  const runtimeDir = path.join(backupDir, 'runtime');

  fs.mkdirSync(packagesDir, { recursive: true });
  fs.mkdirSync(profilesDir, { recursive: true });
  fs.mkdirSync(runtimeDir, { recursive: true });

  const installed = typeof qProfileSnapshotInstalledMods === 'function'
    ? qProfileSnapshotInstalledMods()
    : [];

  const enabledModIds = installed.filter(mod => mod.enabled).map(mod => mod.id).filter(Boolean);
  const disabledModIds = installed.filter(mod => !mod.enabled).map(mod => mod.id).filter(Boolean);

  const copiedPackages = [];
  const missingPackages = [];

  for (const mod of installed) {
    const id = String(mod.id || '').trim();
    if (!id) continue;

    try {
      const src = qLibraryPackagePath(id);
      if (src && fs.existsSync(src)) {
        const dest = path.join(packagesDir, path.basename(src));
        fs.copyFileSync(src, dest);
        copiedPackages.push({ id, file: path.basename(dest) });
      } else {
        missingPackages.push(id);
      }
    } catch (error) {
      missingPackages.push(`${id}: ${error.message || error}`);
    }
  }

  let copiedProfiles = 0;
  try {
    copiedProfiles = qBackupCopyDirJsonFiles(qProfilesDir(), profilesDir);
  } catch (_) {}

  const runtimeFiles = [];
  for (const filePath of [QUARTZ_RUNTIME_MANIFEST, QUARTZ_RUNTIME_STATUS]) {
    try {
      if (filePath && fs.existsSync(filePath)) {
        const dest = path.join(runtimeDir, path.basename(filePath));
        fs.copyFileSync(filePath, dest);
        runtimeFiles.push(path.basename(filePath));
      }
    } catch (_) {}
  }

  const profiles = typeof qListQuartzProfiles === 'function'
    ? (qListQuartzProfiles().profiles || [])
    : [];

  const manifest = {
    format: 'quartz.launcher.backup.v1',
    createdAt: new Date().toISOString(),
    backupName,
    quartzDataDir: qNativeDataDir(),
    installedMods: installed,
    installedCount: installed.length,
    enabledModIds,
    disabledModIds,
    enabledCount: enabledModIds.length,
    disabledCount: disabledModIds.length,
    packages: {
      copiedCount: copiedPackages.length,
      copied: copiedPackages,
      missing: missingPackages
    },
    profiles: {
      copiedCount: copiedProfiles,
      items: profiles
    },
    runtime: {
      copiedFiles: runtimeFiles
    },
    restoreNotes: [
      'Restore copies packages and profiles back into Quartz Launcher data.',
      'Restore reapplies enabled/disabled states for backed-up mods.',
      'Restore does not delete unrelated current mods.'
    ]
  };

  const manifestPath = path.join(backupDir, 'backup.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    ok: true,
    backupDir,
    manifestPath,
    backupName,
    installedCount: installed.length,
    enabledCount: enabledModIds.length,
    disabledCount: disabledModIds.length,
    copiedPackages: copiedPackages.length,
    missingPackages,
    copiedProfiles,
    runtimeFiles
  };
}

async function qPickQuartzBackupFolder() {
  const options = {
    title: 'Choose a Quartz Launcher backup folder',
    defaultPath: qEnsureBackupsRootDir(),
    properties: ['openDirectory']
  };

  const focused = BrowserWindow.getFocusedWindow?.();
  const result = focused
    ? await dialog.showOpenDialog(focused, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || !result.filePaths || !result.filePaths[0]) {
    return null;
  }

  return result.filePaths[0];
}

function qRestoreQuartzBackupFromDir(backupDir) {
  if (!backupDir || !fs.existsSync(backupDir)) {
    return {
      ok: false,
      error: 'Backup folder not found.'
    };
  }

  const manifestPath = path.join(backupDir, 'backup.json');
  const manifest = qBackupReadJson(manifestPath);

  if (!manifest || manifest.format !== 'quartz.launcher.backup.v1') {
    return {
      ok: false,
      error: 'This folder does not look like a Quartz Launcher backup.'
    };
  }

  if (typeof qEnsureNativeFolders === 'function') qEnsureNativeFolders();
  if (typeof qEnsureEnableFolders === 'function') qEnsureEnableFolders();
  if (typeof qEnsureProfilesDir === 'function') qEnsureProfilesDir();

  const restoredPackages = [];
  const failed = [];

  try {
    const packagesDir = path.join(backupDir, 'packages');
    const libraryDir = path.dirname(qLibraryPackagePath('quartz-restore-probe'));

    fs.mkdirSync(libraryDir, { recursive: true });

    if (fs.existsSync(packagesDir)) {
      for (const name of fs.readdirSync(packagesDir)) {
        if (!/\.(quartz|geode|zip)$/i.test(name)) continue;

        const src = path.join(packagesDir, name);
        const stat = fs.statSync(src);
        if (!stat.isFile()) continue;

        const dest = path.join(libraryDir, name);
        fs.copyFileSync(src, dest);
        restoredPackages.push(name);
      }
    }
  } catch (error) {
    failed.push({
      step: 'packages',
      error: error.message || String(error)
    });
  }

  let restoredProfiles = 0;
  try {
    restoredProfiles = qBackupCopyDirJsonFiles(path.join(backupDir, 'profiles'), qProfilesDir());
  } catch (error) {
    failed.push({
      step: 'profiles',
      error: error.message || String(error)
    });
  }

  const installedSnapshot = Array.isArray(manifest.installedMods) ? manifest.installedMods : [];
  const enabledIds = new Set(
    Array.isArray(manifest.enabledModIds)
      ? manifest.enabledModIds.map(id => String(id).trim()).filter(Boolean)
      : installedSnapshot.filter(mod => mod.enabled).map(mod => String(mod.id || '').trim()).filter(Boolean)
  );
  const disabledIds = new Set(
    Array.isArray(manifest.disabledModIds)
      ? manifest.disabledModIds.map(id => String(id).trim()).filter(Boolean)
      : installedSnapshot.filter(mod => !mod.enabled).map(mod => String(mod.id || '').trim()).filter(Boolean)
  );

  let enabledCount = 0;
  let disabledCount = 0;

  for (const id of enabledIds) {
    try {
      qEnableQuartzMod(id);
      enabledCount += 1;
    } catch (error) {
      failed.push({
        step: 'enable',
        id,
        error: error.message || String(error)
      });
    }
  }

  for (const id of disabledIds) {
    try {
      qDisableQuartzMod(id);
      disabledCount += 1;
    } catch (error) {
      failed.push({
        step: 'disable',
        id,
        error: error.message || String(error)
      });
    }
  }

  let runtime = null;
  try {
    if (typeof qBuildRuntimeManifest === 'function') {
      runtime = qBuildRuntimeManifest();
    }
  } catch (error) {
    failed.push({
      step: 'runtime',
      error: error.message || String(error)
    });
  }

  return {
    ok: failed.length === 0,
    backupDir,
    manifest,
    restoredPackages: restoredPackages.length,
    restoredPackageFiles: restoredPackages,
    restoredProfiles,
    enabledCount,
    disabledCount,
    failed,
    runtime
  };
}

for (const channel of [
  'create-quartz-backup',
  'restore-quartz-backup',
  'open-quartz-backups-folder'
]) {
  try {
    ipcMain.removeHandler(channel);
  } catch (_) {}
}

ipcMain.handle('create-quartz-backup', async () => {
  return qCreateQuartzBackup();
});

ipcMain.handle('restore-quartz-backup', async () => {
  const backupDir = await qPickQuartzBackupFolder();
  if (!backupDir) {
    return {
      ok: false,
      canceled: true,
      error: 'Restore canceled.'
    };
  }

  return qRestoreQuartzBackupFromDir(backupDir);
});

ipcMain.handle('open-quartz-backups-folder', async () => {
  const dir = qEnsureBackupsRootDir();
  await shell.openPath(dir);
  return {
    ok: true,
    backupsDir: dir
  };
});
// ===== Quartz Backup / Restore END =====


// ===== Quartz Profiles / Loadouts START =====
// Stores named loadouts of enabled Quartz mods and can apply them later.
// Profiles live in the normal QuartzLauncher data folder, not in the repo.
function qProfilesDir() {
  return path.join(qNativeDataDir(), 'profiles');
}

function qEnsureProfilesDir() {
  const dir = qProfilesDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function qProfileCleanText(value, fallback = '') {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim();
}

function qProfileSlug(value, fallback = 'profile') {
  const base = qProfileCleanText(value, fallback)
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return base || fallback;
}

function qProfilePath(profileId) {
  const safeId = qProfileSlug(profileId, 'profile');
  return path.join(qEnsureProfilesDir(), `${safeId}.json`);
}

function qProfileModId(mod) {
  return String(
    mod?.id ||
    mod?.packageId ||
    mod?.modId ||
    mod?.slug ||
    ''
  ).trim();
}

function qProfileModEnabled(mod) {
  const id = qProfileModId(mod);
  if (!id) return false;

  try {
    if (typeof qIsQuartzModEnabled === 'function') {
      return !!qIsQuartzModEnabled(id);
    }
  } catch (_) {}

  if (mod?.disabled === true) return false;
  if (mod?.enabled === false) return false;
  return true;
}

function qProfileSnapshotInstalledMods() {
  const installed = typeof qInstalledModsWithEnabledState === 'function'
    ? qInstalledModsWithEnabledState()
    : [];

  return installed
    .map(mod => {
      const id = qProfileModId(mod);
      if (!id) return null;

      return {
        id,
        name: qProfileCleanText(mod.name || mod.title || id, id),
        version: qProfileCleanText(mod.version || mod.modVersion || ''),
        author: qProfileCleanText(mod.author || mod.developer || ''),
        enabled: qProfileModEnabled(mod)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function qReadQuartzProfileFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const profile = JSON.parse(raw);
    if (!profile || typeof profile !== 'object') return null;

    const id = qProfileSlug(profile.id || path.basename(filePath, '.json'), 'profile');
    const enabledModIds = Array.isArray(profile.enabledModIds)
      ? profile.enabledModIds.map(id => String(id).trim()).filter(Boolean)
      : [];

    return {
      format: profile.format || 'quartz.launcher.profile.v1',
      id,
      name: qProfileCleanText(profile.name || id, id),
      description: qProfileCleanText(profile.description || ''),
      createdAt: profile.createdAt || '',
      updatedAt: profile.updatedAt || '',
      enabledModIds,
      enabledCount: enabledModIds.length,
      installedSnapshot: Array.isArray(profile.installedSnapshot) ? profile.installedSnapshot : []
    };
  } catch (error) {
    return null;
  }
}

function qListQuartzProfiles() {
  const dir = qEnsureProfilesDir();
  const profiles = fs.readdirSync(dir)
    .filter(name => name.toLowerCase().endsWith('.json'))
    .map(name => qReadQuartzProfileFile(path.join(dir, name)))
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));

  return {
    ok: true,
    profiles,
    count: profiles.length,
    profilesDir: dir
  };
}

function qCreateQuartzProfile(options = {}) {
  const now = new Date().toISOString();
  const name = qProfileCleanText(options.name || 'My Quartz Loadout', 'My Quartz Loadout').slice(0, 90);
  const description = qProfileCleanText(options.description || '').slice(0, 240);

  const snapshot = qProfileSnapshotInstalledMods();
  const enabledModIds = snapshot
    .filter(mod => mod.enabled)
    .map(mod => mod.id)
    .filter(Boolean);

  const dir = qEnsureProfilesDir();
  const baseId = qProfileSlug(options.id || name, 'profile');
  let id = baseId;
  let i = 2;
  while (fs.existsSync(path.join(dir, `${id}.json`))) {
    id = `${baseId}-${i}`;
    i += 1;
  }

  const profile = {
    format: 'quartz.launcher.profile.v1',
    id,
    name,
    description,
    createdAt: now,
    updatedAt: now,
    enabledModIds,
    enabledCount: enabledModIds.length,
    installedSnapshot: snapshot
  };

  const filePath = path.join(dir, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2));

  return {
    ok: true,
    profile,
    filePath,
    profilesDir: dir,
    enabledCount: enabledModIds.length,
    installedCount: snapshot.length
  };
}

function qApplyQuartzProfile(profileId, options = {}) {
  const filePath = qProfilePath(profileId);
  const profile = qReadQuartzProfileFile(filePath);

  if (!profile) {
    return {
      ok: false,
      error: `Profile not found: ${profileId}`
    };
  }

  const installed = qProfileSnapshotInstalledMods();
  const installedIds = new Set(installed.map(mod => mod.id));
  const wantedEnabledIds = new Set(profile.enabledModIds || []);

  let enabledCount = 0;
  let disabledCount = 0;
  const failed = [];

  for (const mod of installed) {
    const id = mod.id;
    if (!id) continue;

    try {
      if (wantedEnabledIds.has(id)) {
        qEnableQuartzMod(id);
        enabledCount += 1;
      } else if (!options.keepExtraEnabled) {
        qDisableQuartzMod(id);
        disabledCount += 1;
      }
    } catch (error) {
      failed.push({
        id,
        error: error?.message || String(error)
      });
    }
  }

  const missingModIds = [...wantedEnabledIds].filter(id => !installedIds.has(id));

  let runtime = null;
  try {
    if (typeof qBuildRuntimeManifest === 'function') {
      runtime = qBuildRuntimeManifest();
    }
  } catch (error) {
    failed.push({
      id: 'runtime-sync',
      error: error?.message || String(error)
    });
  }

  return {
    ok: failed.length === 0,
    profile,
    enabledCount,
    disabledCount,
    missingModIds,
    missingCount: missingModIds.length,
    failed,
    runtime,
    profilesDir: qProfilesDir()
  };
}

function qDeleteQuartzProfile(profileId) {
  const filePath = qProfilePath(profileId);
  if (!fs.existsSync(filePath)) {
    return {
      ok: false,
      error: `Profile not found: ${profileId}`
    };
  }

  fs.rmSync(filePath, { force: true });

  return {
    ok: true,
    deletedId: qProfileSlug(profileId, 'profile'),
    profilesDir: qProfilesDir()
  };
}

for (const channel of [
  'get-quartz-profiles',
  'save-quartz-profile',
  'apply-quartz-profile',
  'delete-quartz-profile',
  'open-quartz-profiles-folder'
]) {
  try {
    ipcMain.removeHandler(channel);
  } catch (_) {}
}

ipcMain.handle('get-quartz-profiles', async () => {
  return qListQuartzProfiles();
});

ipcMain.handle('save-quartz-profile', async (_event, options = {}) => {
  return qCreateQuartzProfile(options);
});

ipcMain.handle('apply-quartz-profile', async (_event, profileId, options = {}) => {
  return qApplyQuartzProfile(profileId, options);
});

ipcMain.handle('delete-quartz-profile', async (_event, profileId) => {
  return qDeleteQuartzProfile(profileId);
});

ipcMain.handle('open-quartz-profiles-folder', async () => {
  const dir = qEnsureProfilesDir();
  await shell.openPath(dir);
  return {
    ok: true,
    profilesDir: dir
  };
});
// ===== Quartz Profiles / Loadouts END =====

ipcMain.handle('export-installed-mod-list', async (_event, rendererMods = []) => {
  try {
    let mods = Array.isArray(rendererMods) ? rendererMods : [];

    if (!mods.length && typeof qInstalledModsWithEnabledState === 'function') {
      mods = qInstalledModsWithEnabledState();
    }

    if (!mods.length && typeof qListInstalledQuartzPackages === 'function') {
      mods = qListInstalledQuartzPackages();
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportDir = path.join(app.getPath('desktop') || os.homedir(), 'QuartzLauncherExports');

    fs.mkdirSync(exportDir, { recursive: true });

    const mdPath = path.join(exportDir, `quartz-installed-mods-${stamp}.md`);
    const jsonPath = path.join(exportDir, `quartz-installed-mods-${stamp}.json`);

    const cleanMods = mods.map(mod => ({
      id: mod.id || mod.packageId || mod.modId || mod.slug || 'unknown',
      name: mod.name || mod.title || mod.id || 'Unknown',
      developer: mod.developer || mod.author || 'Unknown',
      version: mod.version || 'unknown',
      engine: mod.engine || mod.type || 'unknown',
      enabled: typeof mod.enabled === 'boolean' ? mod.enabled : true,
      category: mod.category || '',
      tags: Array.isArray(mod.tags) ? mod.tags : []
    }));

    const enabledCount = cleanMods.filter(mod => mod.enabled).length;
    const disabledCount = cleanMods.length - enabledCount;

    const markdown = [
      '# Quartz Installed Mods',
      '',
      `Exported: ${new Date().toLocaleString()}`,
      `Total: ${cleanMods.length}`,
      `Enabled: ${enabledCount}`,
      `Disabled: ${disabledCount}`,
      '',
      '| Name | ID | Version | Engine | Enabled | Developer |',
      '| --- | --- | --- | --- | --- | --- |',
      ...cleanMods.map(mod => {
        const cells = [
          mod.name,
          mod.id,
          mod.version,
          mod.engine,
          mod.enabled ? 'Yes' : 'No',
          mod.developer
        ].map(value => String(value || '').replace(/\|/g, '\\|'));

        return `| ${cells.join(' | ')} |`;
      }),
      ''
    ].join('\n');

    fs.writeFileSync(mdPath, markdown, 'utf8');
    fs.writeFileSync(jsonPath, JSON.stringify({
      exportedAt: new Date().toISOString(),
      total: cleanMods.length,
      enabledCount,
      disabledCount,
      mods: cleanMods
    }, null, 2) + '\n', 'utf8');

    return {
      ok: true,
      mdPath,
      jsonPath,
      exportDir,
      total: cleanMods.length
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});
// ===== Quartz Export Installed Mod List END =====

