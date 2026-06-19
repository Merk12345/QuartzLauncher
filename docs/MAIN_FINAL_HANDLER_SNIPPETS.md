# Quartz main.js Final Handler Snippets

These snippets were extracted before main.js cleanup.
Use this file to preserve the final live behavior.

## Final get-quartz-index area
```js
// ===== Quartz Enable Disable Default Enabled Fix END =====

// ===== Quartz Index Hide Installed Mods START =====
try {
  ipcMain.removeHandler('get-quartz-index');
} catch {}

ipcMain.handle('get-quartz-index', async (event, options = {}) => {
  try {
    const allMods = qAvailableModsWithEnabledState();

    // Index should only show mods that are NOT already installed.
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
        meta: paged.meta
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
          source: 'quartz-native-library'
        }
      }
    };
  }
});
// ===== Quartz Index Hide Installed Mods END =====

// ===== Quartz Index All Installed Detection START =====
try {
  ipcMain.removeHandler('get-quartz-index');
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
```

## Runtime area
```js

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
  ipcMain.removeHandler('sync-quartz-runtime');
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
  ipcMain.removeHandler('open-quartz-runtime-folder');
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
  ipcMain.removeHandler('get-quartz-runtime-status');
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
```

## Final enable/disable/get-installed area
```js
  return {
    ...mod,
    enabled: false
  };
}

try {
  ipcMain.removeHandler('enable-quartz-mod');
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
  ipcMain.removeHandler('disable-quartz-mod');
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
  ipcMain.removeHandler('get-installed-mods');
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
  ipcMain.removeHandler('get-quartz-index');
} catch {}

ipcMain.handle('get-quartz-index', async (event, options = {}) => {
  try {
    const allMods = qAvailableModsWithEnabledState();
    const filtered = qFilterQuartzPackages(allMods, options);
    const paged = qPageQuartzPackages(filtered, options);

    return {
      ok: true,
      quartzDataDir: QUARTZ_NATIVE_DATA_DIR,
      quartzLibraryDir: QUARTZ_NATIVE_LIBRARY_DIR,
      quartzEnabledDir: QUARTZ_NATIVE_ENABLED_DIR,
      quartzDisabledDir: QUARTZ_NATIVE_DISABLED_MARKERS_DIR,
      index: {
        mods: paged.mods,
        meta: paged.meta
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
```

## Import/folder area
```js
    quartzLibraryDir: QUARTZ_NATIVE_LIBRARY_DIR,
    mod: installedMod
  };
}

try {
  ipcMain.removeHandler('import-local-mod-file');
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

function qEnsureImportFolders() {
  qEnsureNativeFolders();
  fs.mkdirSync(QUARTZ_NATIVE_IMPORTS_DIR, { recursive: true });
  fs.mkdirSync(QUARTZ_NATIVE_IMPORTED_DIR, { recursive: true });
}

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
  ipcMain.removeHandler('open-import-folder');
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
  ipcMain.removeHandler('process-import-folder');
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
  ipcMain.removeHandler('open-quartz-mods-folder');
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
  ipcMain.removeHandler('auto-scan-quartz-mods-folder');
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


```

## Final install/uninstall area
```js
    };
  }
});

try {
  ipcMain.removeHandler('install-quartz-package');
} catch {}

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
  ipcMain.removeHandler('uninstall-quartz-package');
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

```
