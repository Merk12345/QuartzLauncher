# Quartz main.js Handler Map

Generated from current main.js.

## File size

2566 main.js

## IPC handlers

618:ipcMain.handle('launch-gd', async () => {
638:ipcMain.handle('get-quartz-index', async (_event, options = {}) => {
683:ipcMain.handle('get-installed-mods', async () => {
699:ipcMain.handle('get-mod-status', async () => {
717:ipcMain.handle('install-quartz-package', async (_event, packageId) => {
732:ipcMain.handle('uninstall-quartz-package', async (_event, packageId) => {
783:ipcMain.handle('install-isl', async () => {
794:ipcMain.handle('uninstall-isl', async () => {
816:ipcMain.handle('open-mods-folder', async () => {
838:ipcMain.handle('open-link', async (_event, url) => {
1097:ipcMain.handle('get-quartz-index', async (event, options = {}) => {
1133:ipcMain.handle('get-installed-mods', async () => {
1151:ipcMain.handle('install-quartz-package', async (event, packageId) => {
1185:ipcMain.handle('uninstall-quartz-package', async (event, packageId) => {
1467:ipcMain.handle('import-local-mod-file', async (event) => {
1563:ipcMain.handle('open-import-folder', async () => {
1593:ipcMain.handle('process-import-folder', async () => {
1615:ipcMain.handle('open-quartz-mods-folder', async () => {
1645:ipcMain.handle('auto-scan-quartz-mods-folder', async () => {
1854:ipcMain.handle('get-installed-mods', async () => {
1876:ipcMain.handle('get-quartz-index', async (event, options = {}) => {
1916:ipcMain.handle('install-quartz-package', async (event, packageId) => {
1954:ipcMain.handle('uninstall-quartz-package', async (event, packageId) => {
1983:ipcMain.handle('enable-quartz-mod', async (event, packageId) => {
2003:ipcMain.handle('disable-quartz-mod', async (event, packageId) => {
2023:ipcMain.handle('get-quartz-runtime-status', async () => {
2138:ipcMain.handle('enable-quartz-mod', async (event, packageId) => {
2159:ipcMain.handle('disable-quartz-mod', async (event, packageId) => {
2180:ipcMain.handle('get-installed-mods', async () => {
2203:ipcMain.handle('get-quartz-index', async (event, options = {}) => {
2247:ipcMain.handle('get-quartz-index', async (event, options = {}) => {
2297:ipcMain.handle('get-quartz-index', async (event, options = {}) => {
2469:ipcMain.handle('sync-quartz-runtime', async () => {
2484:ipcMain.handle('open-quartz-runtime-folder', async () => {
2514:ipcMain.handle('get-quartz-runtime-status', async () => {

## removeHandler calls

1096:ipcMain.removeHandler('get-quartz-index');
1132:ipcMain.removeHandler('get-installed-mods');
1150:ipcMain.removeHandler('install-quartz-package');
1184:ipcMain.removeHandler('uninstall-quartz-package');
1464:  ipcMain.removeHandler('import-local-mod-file');
1560:  ipcMain.removeHandler('open-import-folder');
1590:  ipcMain.removeHandler('process-import-folder');
1612:  ipcMain.removeHandler('open-quartz-mods-folder');
1642:  ipcMain.removeHandler('auto-scan-quartz-mods-folder');
1851:  ipcMain.removeHandler('get-installed-mods');
1873:  ipcMain.removeHandler('get-quartz-index');
1913:  ipcMain.removeHandler('install-quartz-package');
1951:  ipcMain.removeHandler('uninstall-quartz-package');
1980:  ipcMain.removeHandler('enable-quartz-mod');
2000:  ipcMain.removeHandler('disable-quartz-mod');
2020:  ipcMain.removeHandler('get-quartz-runtime-status');
2135:  ipcMain.removeHandler('enable-quartz-mod');
2156:  ipcMain.removeHandler('disable-quartz-mod');
2177:  ipcMain.removeHandler('get-installed-mods');
2200:  ipcMain.removeHandler('get-quartz-index');
2244:  ipcMain.removeHandler('get-quartz-index');
2294:  ipcMain.removeHandler('get-quartz-index');
2466:  ipcMain.removeHandler('sync-quartz-runtime');
2481:  ipcMain.removeHandler('open-quartz-runtime-folder');
2511:  ipcMain.removeHandler('get-quartz-runtime-status');

## Runtime section

2020:  ipcMain.removeHandler('get-quartz-runtime-status');
2023:ipcMain.handle('get-quartz-runtime-status', async () => {
2353:const QUARTZ_RUNTIME_DIR = path.join(QUARTZ_NATIVE_DATA_DIR, 'runtime');
2354:const QUARTZ_RUNTIME_STAGED_DIR = path.join(QUARTZ_RUNTIME_DIR, 'staged');
2355:const QUARTZ_RUNTIME_LOGS_DIR = path.join(QUARTZ_RUNTIME_DIR, 'logs');
2356:const QUARTZ_RUNTIME_MANIFEST = path.join(QUARTZ_RUNTIME_DIR, 'enabled-manifest.json');
2357:const QUARTZ_RUNTIME_STATUS = path.join(QUARTZ_RUNTIME_DIR, 'runtime-status.json');
2363:  fs.mkdirSync(QUARTZ_RUNTIME_DIR, { recursive: true });
2364:  fs.mkdirSync(QUARTZ_RUNTIME_STAGED_DIR, { recursive: true });
2365:  fs.mkdirSync(QUARTZ_RUNTIME_LOGS_DIR, { recursive: true });
2375:  for (const item of fs.readdirSync(QUARTZ_RUNTIME_STAGED_DIR)) {
2376:    const full = path.join(QUARTZ_RUNTIME_STAGED_DIR, item);
2388:  const stageDir = path.join(QUARTZ_RUNTIME_STAGED_DIR, qRuntimeSafeFolderName(mod.id));
2438:    runtimeDir: QUARTZ_RUNTIME_DIR,
2439:    stagedDir: QUARTZ_RUNTIME_STAGED_DIR,
2444:  fs.writeFileSync(QUARTZ_RUNTIME_MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
2449:    runtimeDir: QUARTZ_RUNTIME_DIR,
2450:    stagedDir: QUARTZ_RUNTIME_STAGED_DIR,
2451:    logsDir: QUARTZ_RUNTIME_LOGS_DIR,
2452:    manifestPath: QUARTZ_RUNTIME_MANIFEST,
2457:  fs.writeFileSync(QUARTZ_RUNTIME_STATUS, JSON.stringify(status, null, 2) + '\n', 'utf8');
2466:  ipcMain.removeHandler('sync-quartz-runtime');
2469:ipcMain.handle('sync-quartz-runtime', async () => {
2481:  ipcMain.removeHandler('open-quartz-runtime-folder');
2484:ipcMain.handle('open-quartz-runtime-folder', async () => {
2488:    const result = await shell.openPath(QUARTZ_RUNTIME_DIR);
2494:        runtimeDir: QUARTZ_RUNTIME_DIR
2500:      runtimeDir: QUARTZ_RUNTIME_DIR
2511:  ipcMain.removeHandler('get-quartz-runtime-status');
2514:ipcMain.handle('get-quartz-runtime-status', async () => {
2520:    if (fs.existsSync(QUARTZ_RUNTIME_STATUS)) {
2522:        status = JSON.parse(fs.readFileSync(QUARTZ_RUNTIME_STATUS, 'utf8'));
2528:      runtimeDir: QUARTZ_RUNTIME_DIR,
2529:      stagedDir: QUARTZ_RUNTIME_STAGED_DIR,
2530:      logsDir: QUARTZ_RUNTIME_LOGS_DIR,
2531:      manifestPath: QUARTZ_RUNTIME_MANIFEST,
2532:      statusPath: QUARTZ_RUNTIME_STATUS,

## Package/index section

638:ipcMain.handle('get-quartz-index', async (_event, options = {}) => {
683:ipcMain.handle('get-installed-mods', async () => {
717:ipcMain.handle('install-quartz-package', async (_event, packageId) => {
732:ipcMain.handle('uninstall-quartz-package', async (_event, packageId) => {
1096:ipcMain.removeHandler('get-quartz-index');
1097:ipcMain.handle('get-quartz-index', async (event, options = {}) => {
1132:ipcMain.removeHandler('get-installed-mods');
1133:ipcMain.handle('get-installed-mods', async () => {
1150:ipcMain.removeHandler('install-quartz-package');
1151:ipcMain.handle('install-quartz-package', async (event, packageId) => {
1184:ipcMain.removeHandler('uninstall-quartz-package');
1185:ipcMain.handle('uninstall-quartz-package', async (event, packageId) => {
1851:  ipcMain.removeHandler('get-installed-mods');
1854:ipcMain.handle('get-installed-mods', async () => {
1873:  ipcMain.removeHandler('get-quartz-index');
1876:ipcMain.handle('get-quartz-index', async (event, options = {}) => {
1913:  ipcMain.removeHandler('install-quartz-package');
1916:ipcMain.handle('install-quartz-package', async (event, packageId) => {
1951:  ipcMain.removeHandler('uninstall-quartz-package');
1954:ipcMain.handle('uninstall-quartz-package', async (event, packageId) => {
1980:  ipcMain.removeHandler('enable-quartz-mod');
1983:ipcMain.handle('enable-quartz-mod', async (event, packageId) => {
2000:  ipcMain.removeHandler('disable-quartz-mod');
2003:ipcMain.handle('disable-quartz-mod', async (event, packageId) => {
2135:  ipcMain.removeHandler('enable-quartz-mod');
2138:ipcMain.handle('enable-quartz-mod', async (event, packageId) => {
2156:  ipcMain.removeHandler('disable-quartz-mod');
2159:ipcMain.handle('disable-quartz-mod', async (event, packageId) => {
2177:  ipcMain.removeHandler('get-installed-mods');
2180:ipcMain.handle('get-installed-mods', async () => {
2200:  ipcMain.removeHandler('get-quartz-index');
2203:ipcMain.handle('get-quartz-index', async (event, options = {}) => {
2244:  ipcMain.removeHandler('get-quartz-index');
2247:ipcMain.handle('get-quartz-index', async (event, options = {}) => {
2294:  ipcMain.removeHandler('get-quartz-index');
2297:ipcMain.handle('get-quartz-index', async (event, options = {}) => {
