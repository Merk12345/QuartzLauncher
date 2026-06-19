# Quartz Runtime Plan

## Phase 1: Runtime manifest

Quartz Launcher writes enabled mods into:

runtime/enabled-manifest.json

Each enabled mod is staged in:

runtime/staged/<mod-id>/

## Phase 2: Runtime validation

The test runtime checks:
- manifest exists
- enabled mods are listed
- staged packages exist
- extracted package folders exist
- engine types are detected

## Phase 3: Quartz native engine

Future native Quartz mods will use:

engine: quartz-native

## Phase 4: Geometry Dash loader

The standalone loader will eventually launch Geometry Dash with Quartz Runtime active.

## Phase 5: Quartz native API

Quartz will expose its own mod API instead of relying on Geode.
