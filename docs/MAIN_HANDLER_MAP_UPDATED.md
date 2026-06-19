# Quartz main.js Updated Handler Map

Generated after cleanup pass.

## File size

2156 main.js

## Remaining IPC handlers

618:ipcMain.handle('launch-gd', async () => {
641:ipcMain.handle('get-mod-status', async () => {
661:ipcMain.handle('install-isl', async () => {
672:ipcMain.handle('uninstall-isl', async () => {
694:ipcMain.handle('open-mods-folder', async () => {
716:ipcMain.handle('open-link', async (_event, url) => {
1237:ipcMain.handle('import-local-mod-file', async (event) => {
1333:ipcMain.handle('open-import-folder', async () => {
1363:ipcMain.handle('process-import-folder', async () => {
1385:ipcMain.handle('open-quartz-mods-folder', async () => {
1415:ipcMain.handle('auto-scan-quartz-mods-folder', async () => {
1634:ipcMain.handle('install-quartz-package', async (event, packageId) => {
1672:ipcMain.handle('uninstall-quartz-package', async (event, packageId) => {
1807:ipcMain.handle('enable-quartz-mod', async (event, packageId) => {
1828:ipcMain.handle('disable-quartz-mod', async (event, packageId) => {
1849:ipcMain.handle('get-installed-mods', async () => {
1887:ipcMain.handle('get-quartz-index', async (event, options = {}) => {
2059:ipcMain.handle('sync-quartz-runtime', async () => {
2074:ipcMain.handle('open-quartz-runtime-folder', async () => {
2104:ipcMain.handle('get-quartz-runtime-status', async () => {

## Remaining removeHandler calls

1234:  ipcMain.removeHandler('import-local-mod-file');
1330:  ipcMain.removeHandler('open-import-folder');
1360:  ipcMain.removeHandler('process-import-folder');
1382:  ipcMain.removeHandler('open-quartz-mods-folder');
1412:  ipcMain.removeHandler('auto-scan-quartz-mods-folder');
1621:  ipcMain.removeHandler('get-installed-mods');
1626:  ipcMain.removeHandler('get-quartz-index');
1631:  ipcMain.removeHandler('install-quartz-package');
1669:  ipcMain.removeHandler('uninstall-quartz-package');
1698:  ipcMain.removeHandler('enable-quartz-mod');
1703:  ipcMain.removeHandler('disable-quartz-mod');
1708:  ipcMain.removeHandler('get-quartz-runtime-status');
1804:  ipcMain.removeHandler('enable-quartz-mod');
1825:  ipcMain.removeHandler('disable-quartz-mod');
1846:  ipcMain.removeHandler('get-installed-mods');
1869:  ipcMain.removeHandler('get-quartz-index');
1877:  ipcMain.removeHandler('get-quartz-index');
1884:  ipcMain.removeHandler('get-quartz-index');
2056:  ipcMain.removeHandler('sync-quartz-runtime');
2071:  ipcMain.removeHandler('open-quartz-runtime-folder');
2101:  ipcMain.removeHandler('get-quartz-runtime-status');

## Possible duplicate helper functions

qAvailableModsWithEnabledState
qDisableQuartzMod
qEnableQuartzMod
qEnsureImportFolders
qInstalledModsWithEnabledState
qIsQuartzModEnabled
qWriteModsFolderReadme
