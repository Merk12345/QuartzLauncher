'use strict';

const state = {
  indexMods: [],
  installedMods: [],
  indexSearch: '',
  indexPage: 1,
  installedPage: 1,
  pageSize: 12
};

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getModId(mod) {
  return mod?.id || mod?.packageId || mod?.modId || mod?.slug || 'unknown';
}

function getModName(mod) {
  return mod?.name || mod?.title || getModId(mod);
}

function isOk(result) {
  if (!result) return false;
  if (result.ok === false) return false;
  if (result.success === false) return false;
  if (result.error) return false;
  return true;
}

function getError(result, fallback = 'Unknown error') {
  return result?.error || result?.message || fallback;
}

function setStatus(text) {
  const status = $('#statusText') || $('#status') || $('.status-text');
  if (status) status.textContent = text;
  console.log('[Quartz]', text);
}

function showPage(pageId) {
  $all('.page').forEach(page => page.classList.remove('active-page'));

  const page = document.getElementById(pageId);
  if (page) page.classList.add('active-page');

  $all('.nav-btn[data-page]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageId);
  });

  if (pageId === 'index') loadIndex();
  if (pageId === 'mods') loadInstalledMods(true);
  if (pageId === 'settings') updateSettings();
}

function addStyles() {
  if ($('#quartz-renderer-clean-style')) return;

  const style = document.createElement('style');
  style.id = 'quartz-renderer-clean-style';
  style.textContent = `
    .page:not(.active-page) {
      display: none !important;
    }

    .quartz-toolbar {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
      margin: 14px 0;
    }

    .quartz-search {
      min-width: 260px;
      flex: 1;
      max-width: 520px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.06);
      color: inherit;
    }

    .quartz-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 14px;
      margin-top: 14px;
    }

    #indexGrid.quartz-grid,
    #indexGrid.quartz-index-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 14px;
    }

    .quartz-card {
      display: block !important;
      padding: 16px;
      border-radius: 16px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      box-shadow: 0 12px 30px rgba(0,0,0,0.18);
    }

    .quartz-card h3 {
      margin: 0 0 8px;
      font-size: 17px;
    }

    .quartz-card p {
      margin: 8px 0;
      opacity: 0.86;
      line-height: 1.35;
    }

    .quartz-meta {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin: 10px 0;
    }

    .quartz-pill {
      font-size: 12px;
      opacity: 0.9;
      border-radius: 999px;
      padding: 4px 8px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.08);
    }

    .quartz-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 12px;
    }

    .quartz-empty,
    .quartz-error {
      display: block !important;
      padding: 18px;
      border-radius: 16px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      margin-top: 14px;
    }

    .quartz-pager {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 16px 0;
    }

    .quartz-runtime-card {
      display: block !important;
      padding: 16px;
      border-radius: 16px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      margin-top: 16px;
    }

    .quartz-runtime-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }

    .quartz-runtime-row:last-child {
      border-bottom: 0;
    }

    .quartz-danger {
      border-color: rgba(255,100,100,0.4) !important;
    }
  `;

  document.head.appendChild(style);
}

function normalizeIndexMods(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.mods)) return result.mods;
  if (Array.isArray(result.packages)) return result.packages;
  if (Array.isArray(result.index)) return result.index;
  if (Array.isArray(result.index?.mods)) return result.index.mods;
  if (Array.isArray(result.index?.packages)) return result.index.packages;
  return [];
}

function normalizeInstalledMods(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.mods)) return result.mods;
  if (Array.isArray(result.installed)) return result.installed;
  if (Array.isArray(result.packages)) return result.packages;
  return [];
}

function modIsEnabled(mod) {
  if (typeof mod.enabled === 'boolean') return mod.enabled;
  if (typeof mod.isEnabled === 'boolean') return mod.isEnabled;
  if (typeof mod.disabled === 'boolean') return !mod.disabled;

  const status = String(mod.status || mod.state || '').toLowerCase();
  if (status === 'disabled') return false;
  if (status === 'enabled') return true;

  return true;
}

function filterAndPage(mods, search, page) {
  const query = search.trim().toLowerCase();

  const filtered = query
    ? mods.filter(mod => {
        const haystack = [
          getModId(mod),
          getModName(mod),
          mod.description,
          mod.developer,
          mod.author,
          mod.category,
          mod.engine,
          ...(Array.isArray(mod.tags) ? mod.tags : [])
        ].join(' ').toLowerCase();

        return haystack.includes(query);
      })
    : mods;

  const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * state.pageSize;

  return {
    mods: filtered.slice(start, start + state.pageSize),
    total: filtered.length,
    totalPages,
    page: safePage
  };
}

function createModCard(mod, mode) {
  const id = getModId(mod);
  const name = getModName(mod);
  const version = mod.version || 'unknown';
  const developer = mod.developer || mod.author || 'unknown';
  const engine = mod.engine || mod.type || 'unknown';
  const description = mod.description || 'No description provided.';
  const enabled = modIsEnabled(mod);

  const card = document.createElement('div');
  card.className = 'mod-card quartz-card';
  card.dataset.modId = id;

  const actionHtml = mode === 'installed'
    ? `
      <button class="secondary-btn small quartz-toggle-btn">${enabled ? 'Disable' : 'Enable'}</button>
      <button class="secondary-btn small quartz-uninstall-btn quartz-danger">Uninstall</button>
    `
    : `
      <button class="primary-btn small quartz-install-btn">Install</button>
    `;

  card.innerHTML = `
    <h3>${esc(name)}</h3>
    <div class="quartz-meta">
      <span class="quartz-pill">${esc(engine)}</span>
      <span class="quartz-pill">v${esc(version)}</span>
      <span class="quartz-pill">${mode === 'installed' ? (enabled ? 'Enabled' : 'Disabled') : 'Available'}</span>
    </div>
    <p>${esc(description)}</p>
    <p><strong>Developer:</strong> ${esc(developer)}</p>
    <div class="quartz-actions">
      ${actionHtml}
    </div>
  `;

  card.querySelector('.quartz-install-btn')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = 'Installing...';

    const result = await window.quartzAPI.installQuartzPackage(id);

    if (!isOk(result)) {
      alert('Install failed:\n' + getError(result));
    }

    await refreshAll();
  });

  card.querySelector('.quartz-uninstall-btn')?.addEventListener('click', async event => {
    const yes = confirm(`Uninstall ${name}?`);
    if (!yes) return;

    event.currentTarget.disabled = true;
    event.currentTarget.textContent = 'Uninstalling...';

    const result = await window.quartzAPI.uninstallQuartzPackage(id);

    if (!isOk(result)) {
      alert('Uninstall failed:\n' + getError(result));
    }

    await refreshAll();
  });

  card.querySelector('.quartz-toggle-btn')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = enabled ? 'Disabling...' : 'Enabling...';

    const fn = enabled
      ? window.quartzAPI.disableQuartzMod
      : window.quartzAPI.enableQuartzMod;

    if (typeof fn !== 'function') {
      alert('Enable/Disable is not connected. Restart Quartz and try again.');
      await refreshAll();
      return;
    }

    const result = await fn(id);

    if (!isOk(result)) {
      alert('Enable/Disable failed:\n' + getError(result));
    }

    await refreshAll();
  });

  return card;
}

function ensureIndexTools() {
  const indexPage = $('#index');
  const grid = $('#indexGrid');

  if (!indexPage || !grid) return;

  if ($('#quartz-index-tools')) return;

  const tools = document.createElement('div');
  tools.id = 'quartz-index-tools';
  tools.className = 'quartz-toolbar';
  tools.innerHTML = `
    <input id="quartz-index-search" class="quartz-search" placeholder="Search Quartz mods..." />
    <button class="secondary-btn small" id="quartz-scan-mods-folder-btn">Scan Mods Folder</button>
    <button class="secondary-btn small" id="quartz-open-mods-folder-btn">Open Mods Folder</button>
  `;

  grid.before(tools);

  $('#quartz-index-search')?.addEventListener('input', event => {
    state.indexSearch = event.target.value || '';
    state.indexPage = 1;
    renderIndex();
  });

  $('#quartz-scan-mods-folder-btn')?.addEventListener('click', autoScanQuartzModsFolder);
  $('#quartz-open-mods-folder-btn')?.addEventListener('click', openQuartzModsFolder);
}

function ensureIndexPager() {
  const indexPage = $('#index');
  const grid = $('#indexGrid');

  if (!indexPage || !grid) return null;

  let pager = $('#quartz-index-pager');

  if (!pager) {
    pager = document.createElement('div');
    pager.id = 'quartz-index-pager';
    pager.className = 'quartz-pager';
    pager.innerHTML = `
      <button class="secondary-btn small" id="quartz-index-prev">Previous</button>
      <span id="quartz-index-page-label">Page 1 / 1</span>
      <button class="secondary-btn small" id="quartz-index-next">Next</button>
    `;
    grid.after(pager);

    $('#quartz-index-prev')?.addEventListener('click', () => {
      state.indexPage = Math.max(1, state.indexPage - 1);
      renderIndex();
    });

    $('#quartz-index-next')?.addEventListener('click', () => {
      state.indexPage += 1;
      renderIndex();
    });
  }

  return pager;
}

async function loadIndex() {
  const grid = $('#indexGrid');
  if (!grid || !window.quartzAPI?.getQuartzIndex) return;

  ensureIndexTools();

  grid.classList.add('quartz-grid');
  grid.innerHTML = '<div class="quartz-empty">Loading Quartz mods...</div>';

  try {
    const [indexResult, installedResult] = await Promise.all([
      window.quartzAPI.getQuartzIndex({ page: 1, pageSize: 5000, category: 'All' }),
      window.quartzAPI.getInstalledMods ? window.quartzAPI.getInstalledMods() : Promise.resolve({ mods: [] })
    ]);

    const allMods = normalizeIndexMods(indexResult);
    const installed = normalizeInstalledMods(installedResult);
    const installedIds = new Set(installed.map(getModId));

    state.indexMods = allMods.filter(mod => !installedIds.has(getModId(mod)));

    renderIndex();
  } catch (error) {
    grid.innerHTML = `<div class="quartz-error">Could not load Index.<br>${esc(error.message || error)}</div>`;
  }
}

function renderIndex() {
  const grid = $('#indexGrid');
  if (!grid) return;

  const pageData = filterAndPage(state.indexMods, state.indexSearch, state.indexPage);
  state.indexPage = pageData.page;

  grid.classList.add('quartz-grid');
  grid.innerHTML = '';

  if (state.indexMods.length === 0) {
    grid.innerHTML = `
      <div class="quartz-empty">
        <h3>All Quartz mods are installed</h3>
        <p>You have installed all currently available Quartz mods. New packages will show here when they are added.</p>
        <button class="primary-btn small" id="quartz-view-installed-from-index">View Installed Mods</button>
      </div>
    `;

    $('#quartz-view-installed-from-index')?.addEventListener('click', () => showPage('mods'));
  } else if (pageData.mods.length === 0) {
    grid.innerHTML = `
      <div class="quartz-empty">
        <h3>No Quartz mods found</h3>
        <p>Try a different search.</p>
      </div>
    `;
  } else {
    pageData.mods.forEach(mod => grid.appendChild(createModCard(mod, 'index')));
  }

  const pager = ensureIndexPager();
  if (pager) {
    $('#quartz-index-page-label').textContent = `Page ${pageData.page} / ${pageData.totalPages} — ${pageData.total} mod(s)`;
    $('#quartz-index-prev').disabled = pageData.page <= 1;
    $('#quartz-index-next').disabled = pageData.page >= pageData.totalPages;
  }
}

function ensureInstalledRoot() {
  const modsPage = $('#mods');
  if (!modsPage) return null;

  let root = $('#quartz-installed-root');

  if (!root || root.parentElement !== modsPage) {
    modsPage.innerHTML = '<div id="quartz-installed-root"></div>';
    root = $('#quartz-installed-root');
  }

  return root;
}

function ensureInstalledPager(root) {
  let pager = $('#quartz-installed-pager');

  if (!pager) {
    pager = document.createElement('div');
    pager.id = 'quartz-installed-pager';
    pager.className = 'quartz-pager';
    pager.innerHTML = `
      <button class="secondary-btn small" id="quartz-installed-prev">Previous</button>
      <span id="quartz-installed-page-label">Page 1 / 1</span>
      <button class="secondary-btn small" id="quartz-installed-next">Next</button>
    `;

    root.appendChild(pager);

    $('#quartz-installed-prev')?.addEventListener('click', () => {
      state.installedPage = Math.max(1, state.installedPage - 1);
      renderInstalledMods();
    });

    $('#quartz-installed-next')?.addEventListener('click', () => {
      state.installedPage += 1;
      renderInstalledMods();
    });
  }

  return pager;
}

async function loadInstalledMods(resetPage = false) {
  const root = ensureInstalledRoot();
  if (!root || !window.quartzAPI?.getInstalledMods) return;

  if (resetPage) state.installedPage = 1;

  root.innerHTML = '<div class="quartz-empty">Loading installed mods...</div>';

  try {
    const result = await window.quartzAPI.getInstalledMods();

    if (!isOk(result)) {
      root.innerHTML = `<div class="quartz-error"><h3>Could not load installed mods</h3><p>${esc(getError(result))}</p></div>`;
      return;
    }

    state.installedMods = normalizeInstalledMods(result);
    renderInstalledMods();
  } catch (error) {
    root.innerHTML = `<div class="quartz-error"><h3>Could not load installed mods</h3><p>${esc(error.message || error)}</p></div>`;
  }
}

function renderInstalledMods() {
  const root = ensureInstalledRoot();
  if (!root) return;

  const pageData = filterAndPage(state.installedMods, '', state.installedPage);
  state.installedPage = pageData.page;

  root.innerHTML = `
    <div class="quartz-toolbar">
      <button class="secondary-btn small" id="quartz-open-mods-folder-btn-2">Open Mods Folder</button>
      <button class="secondary-btn small" id="quartz-scan-mods-folder-btn-2">Scan Mods Folder</button>
    </div>
    <div id="quartz-installed-grid" class="quartz-grid"></div>
  `;

  $('#quartz-open-mods-folder-btn-2')?.addEventListener('click', openQuartzModsFolder);
  $('#quartz-scan-mods-folder-btn-2')?.addEventListener('click', autoScanQuartzModsFolder);

  const grid = $('#quartz-installed-grid');

  if (state.installedMods.length === 0) {
    grid.innerHTML = `
      <div class="quartz-empty">
        <h3>No installed mods</h3>
        <p>Install a Quartz package from the Index or drop .quartz/.geode files into the Quartz Mods folder.</p>
      </div>
    `;
  } else {
    pageData.mods.forEach(mod => grid.appendChild(createModCard(mod, 'installed')));
  }

  const pager = ensureInstalledPager(root);
  $('#quartz-installed-page-label').textContent = `Page ${pageData.page} / ${pageData.totalPages} — ${pageData.total} mod(s)`;
  $('#quartz-installed-prev').disabled = pageData.page <= 1;
  $('#quartz-installed-next').disabled = pageData.page >= pageData.totalPages;
}

async function openQuartzModsFolder() {
  const fn =
    window.quartzAPI?.openQuartzModsFolder ||
    window.quartzAPI?.openImportFolder ||
    window.quartzAPI?.openModsFolder;

  if (typeof fn !== 'function') {
    alert('Open Mods Folder is not connected. Restart Quartz and try again.');
    return;
  }

  const result = await fn();
  if (!isOk(result)) alert('Could not open Mods Folder:\n' + getError(result));
}

async function autoScanQuartzModsFolder() {
  const fn =
    window.quartzAPI?.autoScanQuartzModsFolder ||
    window.quartzAPI?.processImportFolder;

  if (typeof fn !== 'function') {
    alert('Scan Mods Folder is not connected. Restart Quartz and try again.');
    return;
  }

  const result = await fn();

  if (!isOk(result)) {
    alert('Scan failed:\n' + getError(result));
    return;
  }

  await refreshAll();
  alert('Quartz Mods folder scanned.');
}

async function updateSettings() {
  ensureRuntimeSettingsCard();
  quartzRefreshRuntimeCard();

  if (!window.quartzAPI?.getModStatus) return;

  try {
    const result = await window.quartzAPI.getModStatus();
    const modsFolderInput = $('#modsFolderInput');

    if (modsFolderInput && result?.modsFolder) {
      modsFolderInput.value = result.modsFolder;
    }
  } catch {
    // Settings status is non-critical.
  }
}

async function launchGD() {
  if (!window.quartzAPI?.launchGD) {
    alert('Launch Geometry Dash is not connected.');
    return;
  }

  setStatus('Launching Geometry Dash...');
  const result = await window.quartzAPI.launchGD();

  if (!isOk(result)) {
    setStatus('Failed to launch Geometry Dash.');
    alert('Launch failed:\n' + getError(result));
    return;
  }

  setStatus('Geometry Dash launched.');
}

function ensureRuntimeSettingsCard() {
  const settingsPage = $('#settings');
  if (!settingsPage) return;

  if ($('#quartz-runtime-card')) return;

  const card = document.createElement('div');
  card.id = 'quartz-runtime-card';
  card.className = 'quartz-runtime-card';
  card.innerHTML = `
    <h2>Quartz Runtime</h2>
    <p>The runtime folder stages enabled Quartz mods for the future standalone Quartz loader.</p>

    <div class="quartz-runtime-row">
      <span>Installed mods</span>
      <strong id="quartz-runtime-installed-count">...</strong>
    </div>

    <div class="quartz-runtime-row">
      <span>Enabled/staged mods</span>
      <strong id="quartz-runtime-enabled-count">...</strong>
    </div>

    <div class="quartz-runtime-row">
      <span>Runtime folder</span>
      <strong id="quartz-runtime-folder">...</strong>
    </div>

    <div class="quartz-actions">
      <button class="primary-btn small" id="quartz-sync-runtime-btn">Sync Runtime</button>
      <button class="secondary-btn small" id="quartz-open-runtime-folder-btn">Open Runtime Folder</button>
    </div>
  `;

  settingsPage.appendChild(card);

  $('#quartz-sync-runtime-btn')?.addEventListener('click', quartzSyncRuntimeFromSettings);
  $('#quartz-open-runtime-folder-btn')?.addEventListener('click', quartzOpenRuntimeFolderFromSettings);
}

async function quartzRefreshRuntimeCard() {
  if (!window.quartzAPI?.getQuartzRuntimeStatus) {
    $('#quartz-runtime-installed-count') && ($('#quartz-runtime-installed-count').textContent = 'Not connected');
    return;
  }

  try {
    const result = await window.quartzAPI.getQuartzRuntimeStatus();

    if (!isOk(result)) {
      $('#quartz-runtime-installed-count').textContent = 'Error';
      $('#quartz-runtime-enabled-count').textContent = 'Error';
      $('#quartz-runtime-folder').textContent = getError(result);
      return;
    }

    const status = result.status || result;

    $('#quartz-runtime-installed-count').textContent =
      status.installedCount ?? status.installedModsCount ?? status.totalInstalled ?? '0';

    $('#quartz-runtime-enabled-count').textContent =
      status.enabledCount ?? status.stagedCount ?? status.enabledModsCount ?? '0';

    $('#quartz-runtime-folder').textContent =
      status.runtimeDir || status.runtimeFolder || status.path || '~/.config/QuartzLauncher/runtime';
  } catch (error) {
    $('#quartz-runtime-installed-count').textContent = 'Error';
    $('#quartz-runtime-enabled-count').textContent = 'Error';
    $('#quartz-runtime-folder').textContent = error.message || String(error);
  }
}

async function quartzSyncRuntimeFromSettings() {
  const btn = $('#quartz-sync-runtime-btn');

  if (!window.quartzAPI?.syncQuartzRuntime) {
    alert('Runtime sync is not connected. Restart Quartz and try again.');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Syncing...';
  }

  try {
    const result = await window.quartzAPI.syncQuartzRuntime();

    if (!isOk(result)) {
      alert('Runtime sync failed:\n' + getError(result));
    } else {
      const count = result.enabledCount ?? result.stagedCount ?? result.status?.enabledCount ?? 'unknown';
      alert(`Quartz runtime synced.\n\nEnabled mods staged: ${count}`);
    }

    await refreshAll();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Sync Runtime';
    }
  }
}

async function quartzOpenRuntimeFolderFromSettings() {
  if (!window.quartzAPI?.openQuartzRuntimeFolder) {
    alert('Open Runtime Folder is not connected. Restart Quartz and try again.');
    return;
  }

  const result = await window.quartzAPI.openQuartzRuntimeFolder();

  if (!isOk(result)) {
    alert('Could not open Runtime Folder:\n' + getError(result));
  }
}

async function refreshAll() {
  if ($('#index')?.classList.contains('active-page')) await loadIndex();
  if ($('#mods')?.classList.contains('active-page')) await loadInstalledMods();
  if ($('#settings')?.classList.contains('active-page')) await updateSettings();
}

function bindButtons() {
  $all('.nav-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });

  $('#launchBtn')?.addEventListener('click', launchGD);
  $('#browseModsBtn')?.addEventListener('click', () => showPage('index'));
  $('#openModsFolderBtn')?.addEventListener('click', openQuartzModsFolder);

  $('#discordBtn')?.addEventListener('click', () => setStatus('Discord link is not set yet.'));
  $('#websiteBtn')?.addEventListener('click', () => setStatus('Website link is not set yet.'));

  $('#installISLBtn')?.addEventListener('click', async () => {
    if (!window.quartzAPI?.installISL) return alert('Compatibility install is not connected.');
    const result = await window.quartzAPI.installISL();
    if (!isOk(result)) alert('Install failed:\n' + getError(result));
    await refreshAll();
  });

  $('#uninstallISLBtn')?.addEventListener('click', async () => {
    if (!window.quartzAPI?.uninstallISL) return alert('Compatibility uninstall is not connected.');
    const result = await window.quartzAPI.uninstallISL();
    if (!isOk(result)) alert('Uninstall failed:\n' + getError(result));
    await refreshAll();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  addStyles();
  bindButtons();
  ensureIndexTools();
  ensureRuntimeSettingsCard();

  const activePage = $('.page.active-page')?.id || 'home';
  showPage(activePage);

  setStatus('Quartz Launcher ready.');
});
