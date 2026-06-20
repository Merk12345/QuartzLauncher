const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quartzAPI', {
  launchGD: () => ipcRenderer.invoke('launch-gd'),

  getQuartzIndex: (options = {}) => ipcRenderer.invoke('get-quartz-index', options),
  getInstalledMods: () => ipcRenderer.invoke('get-installed-mods'),
  getModStatus: () => ipcRenderer.invoke('get-mod-status'),
  getQuartzRuntimeStatus: () => ipcRenderer.invoke('get-quartz-runtime-status'),
  syncQuartzRuntime: () => ipcRenderer.invoke('sync-quartz-runtime'),
  syncGeodeIndex: () => ipcRenderer.invoke('sync-geode-index'),
  openQuartzRuntimeFolder: () => ipcRenderer.invoke('open-quartz-runtime-folder'),

  installQuartzPackage: (packageId) => ipcRenderer.invoke('install-quartz-package', packageId),
  uninstallQuartzPackage: (packageId) => ipcRenderer.invoke('uninstall-quartz-package', packageId),

  enableQuartzMod: (packageId) => ipcRenderer.invoke('enable-quartz-mod', packageId),
  disableQuartzMod: (packageId) => ipcRenderer.invoke('disable-quartz-mod', packageId),

  importLocalModFile: () => ipcRenderer.invoke('import-local-mod-file'),

  openImportFolder: () => ipcRenderer.invoke('open-import-folder'),
  processImportFolder: () => ipcRenderer.invoke('process-import-folder'),

  openQuartzModsFolder: () => ipcRenderer.invoke('open-quartz-mods-folder'),
  autoScanQuartzModsFolder: () => ipcRenderer.invoke('auto-scan-quartz-mods-folder'),

  devOpenWorkspaceFolder: () => ipcRenderer.invoke('dev-open-workspace-folder'),
  devCreateTemplate: (options = {}) => ipcRenderer.invoke('dev-create-template', options),
  devListProjects: () => ipcRenderer.invoke('dev-list-projects'),
  devOpenProjectFolder: (projectName) => ipcRenderer.invoke('dev-open-project-folder', projectName),
  devBuildQuartzPackage: (projectName) => ipcRenderer.invoke('dev-build-quartz-package', projectName),
  devValidateQuartzPackage: (projectName) => ipcRenderer.invoke('dev-validate-quartz-package', projectName),
  devTestInstallLatestPackage: (projectName) => ipcRenderer.invoke('dev-test-install-latest-package', projectName),
  devOpenBuildsFolder: () => ipcRenderer.invoke('dev-open-builds-folder'),
  devGetLatestBuiltPackage: () => ipcRenderer.invoke('dev-get-latest-built-package'),
  devRunTerminalCommand: (projectName, command) => ipcRenderer.invoke('dev-run-terminal-command', projectName, command),

  openModsFolder: () => ipcRenderer.invoke('open-mods-folder'),

  installISL: () => ipcRenderer.invoke('install-isl'),
  uninstallISL: () => ipcRenderer.invoke('uninstall-isl'),

  openLink: (url) => ipcRenderer.invoke('open-link', url)
});
