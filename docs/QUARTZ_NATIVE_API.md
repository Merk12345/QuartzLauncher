# Quartz Native API v0.1-test

Quartz Native mods use engine: quartz-native

Current status:
- Works in Quartz runtime tester
- Real Geometry Dash loader/injection is not finished yet

Basic package:
MyMod.quartz
- quartz.json
- payload/main.js

Available API:
- quartz.apiVersion
- quartz.mod
- quartz.paths
- quartz.log(message)
- quartz.storage.get(key, fallback)
- quartz.storage.set(key, value)
- quartz.storage.delete(key)
- quartz.storage.all()
- quartz.files.exists(relativePath)
- quartz.files.readText(relativePath)
- quartz.files.list(relativePath)

Correct public wording:
Quartz-native runtime skeleton and API test work.
Actual Geometry Dash native loading is not implemented yet.
