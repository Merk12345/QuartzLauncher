const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quartzAPI', {
  getPublicIndexLocal: () => ipcRenderer.invoke('get-public-index-local'),
  launchGD: () => ipcRenderer.invoke('launch-gd'),

  getQuartzIndex: (options = {}) => ipcRenderer.invoke('get-quartz-index', options),
  getInstalledMods: () => ipcRenderer.invoke('get-installed-mods'),
  exportInstalledModList: (mods = []) => ipcRenderer.invoke('export-installed-mod-list', mods),
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
  devListEditableFiles: (projectName) => ipcRenderer.invoke('dev-list-editable-files', projectName),
  devReadProjectFile: (projectName, relativePath) => ipcRenderer.invoke('dev-read-project-file', projectName, relativePath),
  devWriteProjectFile: (projectName, relativePath, content) => ipcRenderer.invoke('dev-write-project-file', projectName, relativePath, content),
  devGetProjectStatus: (projectName) => ipcRenderer.invoke('dev-get-project-status', projectName),
  devCreateProjectFile: (projectName, relativePath) => ipcRenderer.invoke('dev-create-project-file', projectName, relativePath),
  devPrepareSubmission: (projectName) => ipcRenderer.invoke('dev-prepare-submission', projectName),

  openModsFolder: () => ipcRenderer.invoke('open-mods-folder'),

  installISL: () => ipcRenderer.invoke('install-isl'),
  uninstallISL: () => ipcRenderer.invoke('uninstall-isl'),

  createQuartzBackup: () => ipcRenderer.invoke('create-quartz-backup'),
  restoreQuartzBackup: () => ipcRenderer.invoke('restore-quartz-backup'),
  openQuartzBackupsFolder: () => ipcRenderer.invoke('open-quartz-backups-folder'),
  getQuartzProfiles: () => ipcRenderer.invoke('get-quartz-profiles'),
  saveQuartzProfile: (options = {}) => ipcRenderer.invoke('save-quartz-profile', options),
  applyQuartzProfile: (profileId, options = {}) => ipcRenderer.invoke('apply-quartz-profile', profileId, options),
  deleteQuartzProfile: (profileId) => ipcRenderer.invoke('delete-quartz-profile', profileId),
  openQuartzProfilesFolder: () => ipcRenderer.invoke('open-quartz-profiles-folder'),

  openLink: (url) => ipcRenderer.invoke('open-link', url)
});
