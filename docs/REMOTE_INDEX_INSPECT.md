# Remote Index Inspect

## get-quartz-index handler
1781:ipcMain.handle('get-quartz-index', async (event, options = {}) => {

## install-quartz-package handler
1523:ipcMain.handle('install-quartz-package', async (event, packageId) => {

## index/package helper function names
765:function qSafePackageFileName(id) {
796:function qReadQuartzPackage(packagePath, installed = false) {
864:function qPackageSourceDirs() {
873:function qListAvailableQuartzPackages() {
904:function qListInstalledQuartzPackages() {
917:function qFindAvailableQuartzPackage(packageId) {
921:function qFilterQuartzPackages(mods, options = {}) {
952:function qPageQuartzPackages(mods, options = {}) {
1087:function qConvertGeodeToQuartzPackage(geodePath, outputDir = QUARTZ_NATIVE_PACKAGES_DIR) {
1490:function qEnableSafePackageFileName(id) {
1504:function qEnabledPackagePath(packageId) {
1508:function qLibraryPackagePath(packageId) {
1853:function qValidateQuartzPackageFileSync(packagePath) {
1933:function qStageQuartzPackageForRuntime(mod) {
917:function qFindAvailableQuartzPackage(packageId) {
1642:function qAvailableModsWithEnabledState() {

## quartz-index references
1781:ipcMain.handle('get-quartz-index', async (event, options = {}) => {

## geodeDownloadUrl references

## installMode references
