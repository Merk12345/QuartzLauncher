# Quartz main.js Cleanup Plan

Goal: clean main.js without breaking the working launcher.

Current problem:
- main.js has duplicate ipcMain.handle blocks
- main.js has duplicate helper functions
- final behavior depends on the last registered handler

Safe cleanup rule:
- Do not rewrite main.js until smoke test and runtime test pass
- Preserve final IPC behavior
- Clean one section at a time

Required tests after every cleanup:
- node --check main.js
- npm run smoke:test
- npm run runtime:test
- npm start

Important handlers to preserve:
- launch-gd
- get-quartz-index
- get-installed-mods
- install-quartz-package
- uninstall-quartz-package
- enable-quartz-mod
- disable-quartz-mod
- open-quartz-mods-folder
- auto-scan-quartz-mods-folder
- get-quartz-runtime-status
- sync-quartz-runtime
- open-quartz-runtime-folder

Correct public wording:
Quartz-native runtime skeleton and API test work.
Actual Geometry Dash native loading is not implemented yet.
