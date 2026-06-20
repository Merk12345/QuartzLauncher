'use strict';

const state = {
  indexMods: [],
  installedMods: [],
  indexSearch: '',
  indexPage: 1,
  installedPage: 1,
  pageSize: 12,
  devProjects: [],
  selectedDevProject: '',
  lastDevPackagePath: '' 
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

function devLog(message, details = null) {
  const consoleEl = $('#devConsole');
  const timestamp = new Date().toLocaleTimeString();

  let line = `[${timestamp}] ${message}`;

  if (details !== null && details !== undefined) {
    if (typeof details === 'string') {
      line += `\n${details}`;
    } else {
      line += `\n${JSON.stringify(details, null, 2)}`;
    }
  }

  if (consoleEl) {
    const current = consoleEl.textContent || '';
    consoleEl.textContent = current && current !== 'Quartz Dev Console ready.'
      ? `${current}\n\n${line}`
      : line;
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  console.log('[Quartz Dev]', message, details ?? '');
}

function rememberDevPackagePath(result) {
  if (result?.packagePath) {
    state.lastDevPackagePath = result.packagePath;
  }
}

function summarizeDevResult(result) {
  if (!result) return 'No result returned.';

  const lines = [];

  if (result.message) lines.push(result.message);
  if (result.workspaceDir) lines.push(`Workspace: ${result.workspaceDir}`);
  if (result.modDir) lines.push(`Mod folder: ${result.modDir}`);
  if (result.sourceDir) lines.push(`Source folder: ${result.sourceDir}`);
  if (result.packagePath) lines.push(`Package: ${result.packagePath}`);
  if (result.error) lines.push(`Error: ${result.error}`);

  if (result.validation) {
    lines.push('Validation:');
    lines.push(JSON.stringify(result.validation, null, 2));
  }

  return lines.join('\n') || JSON.stringify(result, null, 2);
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
  if (pageId === 'devtools') refreshDevProjects();
}

function getSelectedDevProject() {
  return $('#devProjectSelect')?.value || state.selectedDevProject || '';
}

function formatDevProjectInfo(project) {
  if (!project) return 'No project selected yet.';

  return [
    `Name: ${project.displayName || project.name}`,
    `ID: ${project.id || 'unknown'}`,
    `Version: ${project.version || 'unknown'}`,
    `Engine: ${project.engine || 'unknown'}`,
    `Author: ${project.author || 'unknown'}`,
    `Folder: ${project.modDir}`
  ].join('\n');
}

function renderDevProjects() {
  const select = $('#devProjectSelect');
  const info = $('#devProjectInfo');

  if (!select) return;

  const projects = state.devProjects || [];

  if (!projects.length) {
    select.innerHTML = '<option value="">No projects yet</option>';
    if (info) info.textContent = 'No projects found. Click Create Starter Mod to make one.';
    return;
  }

  const previous = state.selectedDevProject || select.value || projects[0].name;

  select.innerHTML = projects.map(project => {
    const label = `${project.displayName || project.name} (${project.id || project.name})`;
    return `<option value="${esc(project.name)}">${esc(label)}</option>`;
  }).join('');

  const stillExists = projects.some(project => project.name === previous);
  state.selectedDevProject = stillExists ? previous : projects[0].name;
  select.value = state.selectedDevProject;

  const selected = projects.find(project => project.name === state.selectedDevProject);
  if (info) info.textContent = formatDevProjectInfo(selected);
}

async function refreshDevProjects() {
  if (!window.quartzAPI?.devListProjects) return;

  const result = await window.quartzAPI.devListProjects();

  if (!isOk(result)) {
    devLog('Could not refresh dev projects.', summarizeDevResult(result));
    setStatus(`Dev projects failed: ${getError(result)}`);
    return;
  }

  state.devProjects = result.projects || [];
  renderDevProjects();
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

    .quartz-devtools-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 14px;
      margin-top: 18px;
    }

    .quartz-dev-card {
      padding: 16px;
      border-radius: 16px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
    }

    .quartz-dev-card h3 {
      margin: 0 0 8px;
      font-size: 17px;
    }

    .quartz-dev-card p {
      margin: 8px 0 14px;
      opacity: 0.86;
      line-height: 1.35;
    }

    .quartz-dev-card button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .quartz-dev-project-card {
      margin-top: 18px;
      padding: 16px;
      border-radius: 16px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
    }

    .quartz-dev-project-card h3 {
      margin: 0 0 8px;
    }

    .quartz-dev-project-card p {
      margin: 0 0 12px;
      opacity: 0.86;
    }

    .quartz-dev-project-controls {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      margin: 10px 0;
    }

    .quartz-dev-select {
      min-width: 260px;
      flex: 1;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.08);
      color: inherit;
    }

    .quartz-dev-project-info {
      margin-top: 10px;
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(0,0,0,0.2);
      border: 1px solid rgba(255,255,255,0.08);
      font-size: 13px;
      line-height: 1.45;
      white-space: pre-wrap;
      opacity: 0.9;
    }

    .quartz-dev-form {
      display: grid;
      gap: 10px;
      margin: 12px 0;
    }

    .quartz-dev-form label {
      display: grid;
      gap: 6px;
      font-size: 13px;
      opacity: 0.92;
    }

    .quartz-dev-input {
      width: 100%;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.08);
      color: inherit;
      font: inherit;
    }

    .quartz-dev-input::placeholder {
      color: rgba(255,255,255,0.45);
    }

    .quartz-dev-textarea {
      min-height: 74px;
      resize: vertical;
    }

    .quartz-dev-input,
    .quartz-dev-input select,
    #devCreateWizardSelect {
      background: rgba(255,255,255,0.08);
      color: #f5f7ff;
    }

    #devCreateWizardSelect option {
      background: #1f2430;
      color: #f5f7ff;
    }

    .quartz-dev-wizard {
      margin-top: 14px;
      padding: 14px;
      border-radius: 14px;
      background: rgba(0,0,0,0.22);
      border: 1px solid rgba(255,255,255,0.1);
    }

    .quartz-dev-wizard-head {
      display: grid;
      gap: 4px;
      margin-bottom: 10px;
    }

    .quartz-dev-wizard-head span {
      font-size: 12px;
      opacity: 0.7;
    }

    .quartz-dev-wizard-head strong {
      font-size: 16px;
    }

    .quartz-dev-id-preview {
      margin-top: 10px;
      padding: 9px 10px;
      border-radius: 10px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.08);
      font-size: 12px;
      opacity: 0.88;
      word-break: break-word;
    }

    .quartz-dev-wizard-actions {
      margin-top: 10px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .quartz-dev-console-card {
      margin-top: 16px;
      padding: 16px;
      border-radius: 16px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
    }

    .quartz-dev-console-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }

    .quartz-dev-console-header h3 {
      margin: 0;
    }

    .quartz-dev-console {
      min-height: 180px;
      max-height: 320px;
      overflow: auto;
      white-space: pre-wrap;
      padding: 12px;
      border-radius: 12px;
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.1);
      line-height: 1.45;
      font-size: 12px;
    }


    .quartz-dev-select,
    .quartz-dev-select option,
    .quartz-dev-select optgroup,
    #devCodeFileSelect,
    #devCodeFileSelect option,
    #devCodeFileSelect optgroup,
    #devProjectSelect,
    #devProjectSelect option,
    #devProjectSelect optgroup {
      background-color: #1f2430 !important;
      color: #f5f7ff !important;
    }

    .quartz-dev-select option:checked,
    #devCodeFileSelect option:checked,
    #devProjectSelect option:checked {
      background-color: #2d63c8 !important;
      color: #ffffff !important;
    }

    .quartz-dev-status-card {
      margin-top: 16px;
      padding: 16px;
      border-radius: 16px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
    }

    .quartz-dev-status-output {
      min-height: 120px;
      max-height: 260px;
      overflow: auto;
      white-space: pre-wrap;
      padding: 12px;
      border-radius: 12px;
      background: rgba(0,0,0,0.28);
      border: 1px solid rgba(255,255,255,0.1);
      line-height: 1.45;
      font-size: 12px;
    }

    .quartz-dev-editor-card {
      margin-top: 16px;
      padding: 16px;
      border-radius: 16px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
    }

    .quartz-dev-editor-controls {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      margin-bottom: 10px;
    }

    .quartz-dev-new-file-controls {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      margin: 0 0 10px;
    }

    .quartz-dev-editor-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0 0 10px;
    }

    .quartz-dev-code-editor {
      width: 100%;
      min-height: 320px;
      max-height: 620px;
      resize: vertical;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(0,0,0,0.34);
      color: #f5f7ff;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.5;
      tab-size: 2;
      outline: none;
    }

    .quartz-dev-code-editor:focus {
      border-color: rgba(255,255,255,0.28);
    }

    .quartz-dev-code-info {
      margin-top: 8px;
      font-size: 12px;
      opacity: 0.82;
      word-break: break-word;
    }

    .quartz-dev-terminal-card {
      margin-top: 16px;
      padding: 16px;
      border-radius: 16px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
    }

    .quartz-dev-terminal-note {
      margin: 0 0 12px;
      opacity: 0.82;
      line-height: 1.4;
    }

    .quartz-dev-terminal-layout {
      display: grid;
      grid-template-columns: 190px minmax(0, 1fr);
      gap: 12px;
    }

    .quartz-dev-command-buttons {
      display: grid;
      gap: 8px;
      align-content: start;
    }

    .quartz-dev-command-buttons button {
      width: 100%;
      text-align: left;
    }

    .quartz-dev-terminal-main {
      display: grid;
      gap: 10px;
      min-width: 0;
    }

    .quartz-dev-terminal-output {
      min-height: 220px;
      max-height: 360px;
      overflow: auto;
      white-space: pre-wrap;
      padding: 12px;
      border-radius: 12px;
      background: rgba(0,0,0,0.34);
      border: 1px solid rgba(255,255,255,0.1);
      line-height: 1.45;
      font-size: 12px;
    }

    .quartz-dev-terminal-input-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
    }

    .quartz-dev-terminal-input {
      width: 100%;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.08);
      color: inherit;
      font: inherit;
    }

    @media (max-width: 850px) {
      .quartz-dev-terminal-layout {
        grid-template-columns: 1fr;
      }

      .quartz-dev-command-buttons {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    .quartz-links {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .quartz-link-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .support-btn {
      width: 100%;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.12);
      color: inherit;
      font-weight: 700;
      cursor: pointer;
    }

    .support-btn:hover {
      background: rgba(255,255,255,0.18);
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
    const btn = event.currentTarget;
    const originalText = btn.textContent || 'Install';

    btn.disabled = true;
    btn.textContent = 'Installing...';

    try {
      const result = await window.quartzAPI.installQuartzPackage(id);

      if (!isOk(result)) {
        btn.disabled = false;
        btn.textContent = originalText;
        alert(`Install failed for ${name}:\n` + getError(result));
        return;
      }

      btn.textContent = 'Installed!';
      await refreshAll();
    } catch (error) {
      btn.disabled = false;
      btn.textContent = originalText;
      alert(`Install crashed for ${name}:\n` + (error.message || error));
    }
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

async function refreshQuartzIndex(event) {
  const btn = event?.currentTarget || $('#quartz-refresh-index-btn');
  const originalText = btn?.textContent || 'Refresh Index';

  if (!window.quartzAPI?.syncGeodeIndex) {
    alert('Refresh Index is not connected. Restart Quartz and try again.');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Refreshing...';
  }

  try {
    const result = await window.quartzAPI.syncGeodeIndex();

    if (!isOk(result)) {
      alert('Refresh Index failed:\n' + getError(result));
      return;
    }

    state.indexPage = 1;
    await loadIndex();

    if (result.stdout) {
      console.log('[Quartz Index Refresh]', result.stdout);
    }
  } catch (error) {
    alert('Refresh Index crashed:\n' + (error.message || error));
  } finally {
    if (btn && document.body.contains(btn)) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
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
    <button class="secondary-btn small" id="quartz-refresh-index-btn">Refresh Index</button>
    <button class="secondary-btn small" id="quartz-scan-mods-folder-btn">Scan Mods Folder</button>
    <button class="secondary-btn small" id="quartz-open-mods-folder-btn">Open Mods Folder</button>
  `;

  grid.before(tools);

  $('#quartz-index-search')?.addEventListener('input', event => {
    state.indexSearch = event.target.value || '';
    state.indexPage = 1;
    renderIndex();
  });

  $('#quartz-refresh-index-btn')?.addEventListener('click', refreshQuartzIndex);
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

  $('#supportBtn')?.addEventListener('click', async () => {
    setStatus('Opening Ko-fi...');
    const result = await window.quartzAPI.openLink('https://ko-fi.com/merk12345');
    if (!isOk(result)) setStatus(`Ko-fi failed: ${getError(result)}`);
    else setStatus('Ko-fi opened in your browser.');
  });

  $('#discordBtn')?.addEventListener('click', async () => {
    setStatus('Opening Discord...');
    const result = await window.quartzAPI.openLink('https://discord.gg/EfQXNFgQF');
    if (!isOk(result)) setStatus(`Discord failed: ${getError(result)}`);
    else setStatus('Discord opened in your browser.');
  });

  $('#websiteBtn')?.addEventListener('click', async () => {
    setStatus('Opening website...');
    const result = await window.quartzAPI.openLink('https://quartz-launcher.pages.dev');
    if (!isOk(result)) setStatus(`Website failed: ${getError(result)}`);
    else setStatus('Website opened in your browser.');
  });

  $('#openDevDocsBtn')?.addEventListener('click', async () => {
    setStatus('Opening Developer Center...');
    const result = await window.quartzAPI.openLink('https://quartz-launcher.pages.dev/#developers');
    if (!isOk(result)) setStatus(`Developer docs failed: ${getError(result)}`);
    else setStatus('Developer Center opened in your browser.');
  });

  $('#openPackageDocsBtn')?.addEventListener('click', async () => {
    setStatus('Opening package docs...');
    const result = await window.quartzAPI.openLink('https://quartz-launcher.pages.dev/#developers');
    if (!isOk(result)) setStatus(`Package docs failed: ${getError(result)}`);
    else setStatus('Package docs opened in your browser.');
  });

  $('#devOpenWorkspaceBtn')?.addEventListener('click', async () => {
    setStatus('Opening dev workspace...');
    devLog('Opening dev workspace...');
    const result = await window.quartzAPI.devOpenWorkspaceFolder();
    devLog(isOk(result) ? 'Workspace opened.' : 'Workspace failed.', summarizeDevResult(result));
    if (!isOk(result)) setStatus(`Workspace failed: ${getError(result)}`);
    else setStatus('Dev workspace opened.');
  });

  const devCreateWizardState = {
    step: 0,
    name: '',
    author: '',
    description: '',
    template: 'basic'
  };

  const devCreateSteps = [
    {
      key: 'name',
      label: 'Mod Name',
      placeholder: 'Example: Test Button Mod',
      multiline: false
    },
    {
      key: 'author',
      label: 'Author',
      placeholder: 'Example: itzrealmerk',
      multiline: false
    },
    {
      key: 'description',
      label: 'Description',
      placeholder: 'What does your mod do?',
      multiline: true
    },
    {
      key: 'template',
      label: 'Template Type',
      placeholder: '',
      select: true
    }
  ];

  function devSlugFromName(value) {
    const slug = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);

    return slug || 'my-quartz-mod';
  }

  function devGeneratedIdFromName(name) {
    return `local.${devSlugFromName(name)}`;
  }

  function getDevWizardInputEl() {
    const step = devCreateSteps[devCreateWizardState.step];

    if (step?.select) return $('#devCreateWizardSelect');

    return step?.multiline ? $('#devCreateWizardTextarea') : $('#devCreateWizardInput');
  }

  function saveDevWizardStep() {
    const step = devCreateSteps[devCreateWizardState.step];
    const input = getDevWizardInputEl();

    if (!step || !input) return;

    devCreateWizardState[step.key] = input.value.trim();
  }

  function renderDevCreateWizard() {
    const wizard = $('#devCreateWizard');
    const input = $('#devCreateWizardInput');
    const textarea = $('#devCreateWizardTextarea');
    const select = $('#devCreateWizardSelect');
    const label = $('#devCreateStepLabel');
    const question = $('#devCreateQuestion');
    const preview = $('#devGeneratedIdPreview');
    const backBtn = $('#devWizardBackBtn');
    const nextBtn = $('#devWizardNextBtn');
    const createBtn = $('#devWizardCreateBtn');

    if (!wizard || !input || !textarea || !select) return;

    const step = devCreateSteps[devCreateWizardState.step];

    if (label) label.textContent = `Step ${devCreateWizardState.step + 1} of ${devCreateSteps.length}`;
    if (question) question.textContent = step.label;

    input.hidden = !!step.multiline || !!step.select;
    textarea.hidden = !step.multiline;
    select.hidden = !step.select;

    const activeInput = getDevWizardInputEl();
    activeInput.value = devCreateWizardState[step.key] || (step.select ? 'basic' : '');
    if ('placeholder' in activeInput) activeInput.placeholder = step.placeholder || '';

    const nameForId = devCreateWizardState.name || activeInput.value || 'My Quartz Mod';
    if (preview) preview.textContent = `Auto Mod ID: ${devGeneratedIdFromName(nameForId)}`;

    if (backBtn) backBtn.disabled = devCreateWizardState.step === 0;
    if (nextBtn) nextBtn.hidden = devCreateWizardState.step === devCreateSteps.length - 1;
    if (createBtn) createBtn.hidden = devCreateWizardState.step !== devCreateSteps.length - 1;

    setTimeout(() => activeInput.focus(), 50);
  }

  function openDevCreateWizard() {
    const wizard = $('#devCreateWizard');
    if (!wizard) return;

    wizard.hidden = false;
    devCreateWizardState.step = 0;
    devCreateWizardState.name = '';
    devCreateWizardState.author = '';
    devCreateWizardState.description = '';
    devCreateWizardState.template = 'basic';

    renderDevCreateWizard();
    setStatus('Create New Mod started.');
    devLog('Create New Mod wizard opened.');
  }

  function nextDevWizardStep() {
    saveDevWizardStep();

    if (devCreateWizardState.step < devCreateSteps.length - 1) {
      devCreateWizardState.step += 1;
      renderDevCreateWizard();
    }
  }

  function backDevWizardStep() {
    saveDevWizardStep();

    if (devCreateWizardState.step > 0) {
      devCreateWizardState.step -= 1;
      renderDevCreateWizard();
    }
  }

  async function createModFromWizard() {
    saveDevWizardStep();

    const name = devCreateWizardState.name || 'My Quartz Mod';
    const options = {
      name,
      id: devGeneratedIdFromName(name),
      author: devCreateWizardState.author || 'YourName',
      description: devCreateWizardState.description || 'A starter Quartz-native mod.',
      template: 'basic'
    };

    setStatus('Creating starter mod...');
    devLog('Creating starter Quartz mod...', options);

    const result = await window.quartzAPI.devCreateTemplate(options);

    devLog(isOk(result) ? 'Starter mod created.' : 'Starter mod failed.', summarizeDevResult(result));

    if (!isOk(result)) {
      setStatus(`Create mod failed: ${getError(result)}`);
      return;
    }

    setStatus('Starter mod created.');

    const wizard = $('#devCreateWizard');
    if (wizard) wizard.hidden = true;

    await refreshDevProjects();

    if (result.modDir) {
      const createdName = result.modDir.split('/').pop();
      state.selectedDevProject = createdName;
      renderDevProjects();
    }
  }

  $('#devStartCreateWizardBtn')?.addEventListener('click', openDevCreateWizard);
  $('#devWizardNextBtn')?.addEventListener('click', nextDevWizardStep);
  $('#devWizardBackBtn')?.addEventListener('click', backDevWizardStep);
  $('#devWizardCreateBtn')?.addEventListener('click', createModFromWizard);

  $('#devCreateWizardInput')?.addEventListener('input', event => {
    const step = devCreateSteps[devCreateWizardState.step];

    if (step?.key === 'name') {
      const cleaned = event.target.value
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');

      if (event.target.value !== cleaned) {
        event.target.value = cleaned;
      }
    }

    saveDevWizardStep();
    renderDevCreateWizard();
  });

  $('#devCreateWizardTextarea')?.addEventListener('input', () => {
    saveDevWizardStep();
    renderDevCreateWizard();
  });

  $('#devCreateWizardSelect')?.addEventListener('change', () => {
    saveDevWizardStep();
    renderDevCreateWizard();
  });

  $('#devCreateWizardInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      nextDevWizardStep();
    }
  });

  $('#devCreateWizardTextarea')?.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      nextDevWizardStep();
    }
  });

  $('#devCreateWizardSelect')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      createModFromWizard();
    }
  });

  $('#devBuildPackageBtn')?.addEventListener('click', async () => {
    setStatus('Building .quartz package...');
    devLog('Building .quartz package...');
    const projectName = getSelectedDevProject();
    const result = await window.quartzAPI.devBuildQuartzPackage(projectName);
    rememberDevPackagePath(result);
    devLog(isOk(result) ? 'Build finished.' : 'Build finished with issues.', summarizeDevResult(result));
    if (!isOk(result)) setStatus(`Build issue: ${getError(result, 'Validation found issues')}`);
    else setStatus('Package built successfully.');
      refreshDevProjectStatus();
  });

  $('#devValidatePackageBtn')?.addEventListener('click', async () => {
    setStatus('Validating .quartz package...');
    devLog('Validating .quartz package...');
    const projectName = getSelectedDevProject();
    const result = await window.quartzAPI.devValidateQuartzPackage(projectName);
    rememberDevPackagePath(result);
    devLog(isOk(result) ? 'Validation passed.' : 'Validation found issues.', summarizeDevResult(result));
    if (!isOk(result)) setStatus(`Validation issue: ${getError(result, 'Validation found issues')}`);
    else setStatus('Package passed validation.');
      refreshDevProjectStatus();
  });

  $('#devImportLocalBtn')?.addEventListener('click', async () => {
    setStatus('Test installing selected project build...');
    devLog('Test installing selected project build...');
    const projectName = getSelectedDevProject();
    const result = await window.quartzAPI.devTestInstallLatestPackage(projectName);
    rememberDevPackagePath(result);
    devLog(isOk(result) ? 'Test install finished.' : 'Test install failed.', summarizeDevResult(result));
    if (!isOk(result)) setStatus(`Test install failed: ${getError(result)}`);
    else setStatus('Selected project build test installed.');
      refreshDevProjectStatus();
    loadInstalledMods(true);
  });

  $('#devRefreshProjectsBtn')?.addEventListener('click', async () => {
    setStatus('Refreshing dev projects...');
    devLog('Refreshing dev projects...');
    await refreshDevProjects();
    setStatus('Dev projects refreshed.');
  });

  $('#devProjectSelect')?.addEventListener('change', () => {
    state.selectedDevProject = getSelectedDevProject();
    const selected = state.devProjects.find(project => project.name === state.selectedDevProject);
    const info = $('#devProjectInfo');
    if (info) info.textContent = formatDevProjectInfo(selected);
    devLog(`Selected project: ${state.selectedDevProject || 'none'}`);
  });

  $('#devOpenProjectBtn')?.addEventListener('click', async () => {
    const projectName = getSelectedDevProject();
    setStatus('Opening selected project...');
    devLog('Opening selected project...', projectName || 'No project selected');
    const result = await window.quartzAPI.devOpenProjectFolder(projectName);
    devLog(isOk(result) ? 'Project folder opened.' : 'Project folder failed.', summarizeDevResult(result));
    if (!isOk(result)) setStatus(`Open project failed: ${getError(result)}`);
    else setStatus('Project folder opened.');
  });

  $('#devOpenBuildsBtn')?.addEventListener('click', async () => {
    setStatus('Opening builds folder...');
    devLog('Opening builds folder...');
    const result = await window.quartzAPI.devOpenBuildsFolder();
    devLog(isOk(result) ? 'Builds folder opened.' : 'Builds folder failed.', summarizeDevResult(result));
    if (!isOk(result)) setStatus(`Open builds failed: ${getError(result)}`);
    else setStatus('Builds folder opened.');
  });

  $('#devCopyPackagePathBtn')?.addEventListener('click', async () => {
    if (!state.lastDevPackagePath) {
      devLog('No remembered package path. Checking builds folder for latest package...');
      const latest = await window.quartzAPI.devGetLatestBuiltPackage();

      if (isOk(latest) && latest.packagePath) {
        rememberDevPackagePath(latest);
        devLog('Found latest built package.', latest.packagePath);
      }
    }

    if (!state.lastDevPackagePath) {
      setStatus('No built package found yet. Build a .quartz package first.');
      devLog('No package path available yet.');
      return;
    }

    try {
      await navigator.clipboard.writeText(state.lastDevPackagePath);
      setStatus('Latest package path copied.');
      devLog('Copied latest package path.', state.lastDevPackagePath);
    } catch (_error) {
      setStatus('Could not copy package path.');
    }
  });

  async function refreshDevProjectStatus(logToTerminal = false) {
    const out = $('#devProjectStatusOutput');
    const result = await window.quartzAPI.devGetProjectStatus(getSelectedDevProject());

    if (out) {
      out.textContent = result.output || getError(result, 'Could not load project status.');
    }

    if (logToTerminal) {
      devTerminalLog(
        isOk(result) ? 'Project status:' : 'Project status failed:',
        result.output || getError(result)
      );
    }

    if (isOk(result)) {
      if (result.buildState === 'outdated') {
        setStatus('Project build is outdated. Rebuild recommended.');
      } else if (result.buildState === 'missing') {
        setStatus('No build found for selected project yet.');
      } else {
        setStatus('Project build is up to date.');
      }
    } else {
      setStatus(`Project status failed: ${getError(result)}`);
    }

    return result;
  }

  function setDevCodeInfo(message) {
    const info = $('#devCodeEditorInfo');
    if (info) info.textContent = message || 'No file open yet.';
  }

  function getDevSelectedCodeFile() {
    const select = $('#devCodeFileSelect');
    const editor = $('#devCodeEditor');

    return select?.value || editor?.dataset.relativePath || '';
  }

  async function refreshDevEditableFiles(preferredPath = '') {
    const select = $('#devCodeFileSelect');
    if (!select) return { ok: false, error: 'Code editor file select not found.' };

    const projectName = getSelectedDevProject();
    const result = await window.quartzAPI.devListEditableFiles(projectName);

    select.innerHTML = '';

    if (!isOk(result)) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = getError(result, 'No editable files found.');
      select.appendChild(option);
      setDevCodeInfo(getError(result, 'No editable files found.'));
      return result;
    }

    const files = Array.isArray(result.files) ? result.files : [];

    if (!files.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No editable files found';
      select.appendChild(option);
      setDevCodeInfo('No editable files found for this project.');
      return result;
    }

    for (const file of files) {
      const option = document.createElement('option');
      option.value = file.relativePath;
      option.textContent = file.label || file.relativePath;
      select.appendChild(option);
    }

    const chosen = preferredPath && files.some(file => file.relativePath === preferredPath)
      ? preferredPath
      : files[0].relativePath;

    select.value = chosen;
    setDevCodeInfo(`Editable files loaded for ${result.projectName}.`);

    return result;
  }

  async function openDevCodeFile(relativePath = '') {
    const editor = $('#devCodeEditor');
    if (!editor) return { ok: false, error: 'Code editor not found.' };

    const fileToOpen = relativePath || getDevSelectedCodeFile();

    if (!fileToOpen) {
      setDevCodeInfo('Select a file first.');
      return { ok: false, error: 'Select a file first.' };
    }

    const result = await window.quartzAPI.devReadProjectFile(getSelectedDevProject(), fileToOpen);

    if (!isOk(result)) {
      setDevCodeInfo(`Open failed: ${getError(result)}`);
      setStatus(`Open file failed: ${getError(result)}`);
      return result;
    }

    const select = $('#devCodeFileSelect');
    if (select) select.value = result.relativePath;

    editor.value = result.content || '';
    editor.dataset.relativePath = result.relativePath;
    editor.dataset.projectName = result.projectName || '';

    setDevCodeInfo(`Open: ${result.relativePath}`);
    setStatus(`Opened ${result.relativePath}`);

    return result;
  }

  async function saveDevCodeFile() {
    const editor = $('#devCodeEditor');

    if (!editor) {
      return { ok: false, error: 'Code editor not found.' };
    }

    const relativePath = editor.dataset.relativePath || getDevSelectedCodeFile();

    if (!relativePath) {
      setDevCodeInfo('Open a file before saving.');
      return { ok: false, error: 'Open a file before saving.' };
    }

    const result = await window.quartzAPI.devWriteProjectFile(
      getSelectedDevProject(),
      relativePath,
      editor.value
    );

    if (!isOk(result)) {
      setDevCodeInfo(`Save failed: ${getError(result)}`);
      setStatus(`Save failed: ${getError(result)}`);
      devLog(`Save failed for ${relativePath}: ${getError(result)}`);
      return result;
    }

    editor.dataset.dirty = 'false';

    setDevCodeInfo(`Saved: ${result.relativePath}`);
    setStatus(`Saved ${result.relativePath}`);
    refreshDevProjectStatus();
    devLog(`Saved ${result.relativePath}`);

    if (result.relativePath === 'quartz.json') {
      refreshDevProjects();
  refreshDevProjectStatus();
    }

    return result;
  }

  async function prepareDevSubmission() {
    const projectName = getSelectedDevProject();

    devLog(`Preparing submission${projectName ? ` for ${projectName}` : ''}...`);
    devTerminalLog(`Preparing submission${projectName ? ` for ${projectName}` : ''}...`);

    if (!window.quartzAPI?.devPrepareSubmission) {
      const error = 'Prepare Submission backend is not available. Restart Quartz Launcher and try again.';
      devLog(error);
      devTerminalLog('Prepare submission failed:', error);
      setStatus(error);
      return { ok: false, error };
    }

    const result = await window.quartzAPI.devPrepareSubmission(projectName);

    if (isOk(result)) {
      rememberDevPackagePath(result);
      devLog(result.output || result.message || 'Submission prepared.');
      devTerminalLog('Submission prepared:', result.output || result.message || '');
      setStatus('Submission prepared.');
      refreshDevProjectStatus();
    } else {
      devLog(result.output || getError(result));
      devTerminalLog('Prepare submission failed:', result.output || getError(result));
      setStatus(`Prepare submission failed: ${getError(result)}`);
    }

    return result;
  }

  async function createDevCodeFile(relativePath = '') {
    const input = $('#devNewFileInput');
    const requestedPath = String(relativePath || input?.value || '').trim();

    if (!requestedPath) {
      const error = 'Enter a file name first, like helpers.js.';
      setDevCodeInfo(error);
      setStatus(error);
      devTerminalLog('Create file failed:', error);
      return { ok: false, error };
    }

    if (!window.quartzAPI?.devCreateProjectFile) {
      const error = 'New File backend is not available. Restart Quartz Launcher and try again.';
      setDevCodeInfo(error);
      setStatus(error);
      devTerminalLog('Create file failed:', error);
      return { ok: false, error };
    }

    const result = await window.quartzAPI.devCreateProjectFile(getSelectedDevProject(), requestedPath);

    if (!isOk(result)) {
      setDevCodeInfo(`Create file failed: ${getError(result)}`);
      setStatus(`Create file failed: ${getError(result)}`);
      devLog(`Create file failed: ${getError(result)}`);
      devTerminalLog('Create file failed:', getError(result));
      return result;
    }

    if (input) input.value = '';

    await refreshDevEditableFiles(result.relativePath);
    await openDevCodeFile(result.relativePath);
    await refreshDevProjectStatus();

    setDevCodeInfo(`Created and opened: ${result.relativePath}`);
    setStatus(`Created ${result.relativePath}`);
    devLog(`Created ${result.relativePath}`);
    devTerminalLog('Created file:', result.relativePath);

    return result;
  }

  async function saveThenRunDevCommand(command) {
    const saveResult = await saveDevCodeFile();

    if (!isOk(saveResult)) {
      devTerminalLog(`Save failed before ${command}:`, getError(saveResult));
      return saveResult;
    }

    devTerminalLog(`Saved ${saveResult.relativePath}. Running ${command}...`);
    await runDevTerminalCommand(command);

    return saveResult;
  }

  function devTerminalLog(message, details = null) {
    const out = $('#devTerminalOutput');
    if (!out) return;

    let finalMessage = String(message || '');

    if (details !== null && details !== undefined) {
      if (typeof details === 'string') {
        finalMessage += `\n${details}`;
      } else {
        finalMessage += `\n${JSON.stringify(details, null, 2)}`;
      }
    }

    const current = out.textContent || '';
    const text = current && current !== 'Quartz Dev Terminal ready. Type help to see commands.'
      ? `${current}\n\n${finalMessage}`
      : finalMessage;

    out.textContent = text;
    out.scrollTop = out.scrollHeight;
  }

  async function runDevTerminalCommand(command) {
    const raw = String(command || '').trim();
    const cmd = raw.toLowerCase().split(/\s+/)[0];
    const args = raw.slice(cmd.length).trim();

    if (!cmd) return;

    devTerminalLog(`> ${raw}`);

    if (cmd === 'help') {
      devTerminalLog([
        'Available safe commands:',
        '',
        'help       Show this command list',
        'status     Show project tracking/build freshness',
        'ls         List files in the selected project',
        'tree       Show project folder tree',
        'manifest   Show quartz.json',
        'files      List editable project files',
        'edit-main  Open payload/main.js in Code Editor',
        'edit-manifest Open quartz.json in Code Editor',
        'check      Check starter JS syntax',
        'save       Save the open editor file',
        'save-run   Save open file, then run',
        'save-check Save open file, then check syntax',
        'save-build Save open file, then build',
        'save-install Save open file, then test install',
        'run        Run starter JS',
        'build      Build selected project',
        'validate   Validate selected build',
        'test       Test install selected build',
        'install    Same as test install',
        'submit     Prepare review submission folder',
        'open       Open selected project folder',
        '',
        'Note: this is a controlled Dev Terminal, not a full system shell yet.'
      ].join('\n'));
      return;
    }

    if (cmd === 'status') {
      await refreshDevProjectStatus(true);
      return;
    }

    if (cmd === 'create' || cmd === 'create-file' || cmd === 'new-file') {
      await createDevCodeFile(args);
      return;
    }

    if (cmd === 'submit' || cmd === 'prepare-submit' || cmd === 'submission') {
      await prepareDevSubmission();
      return;
    }

    if (cmd === 'save') {
      const result = await saveDevCodeFile();

      devTerminalLog(
        isOk(result) ? 'Saved open editor file:' : 'Save failed:',
        isOk(result) ? result.relativePath : getError(result)
      );

      return;
    }

    if (cmd === 'save-run') {
      await saveThenRunDevCommand('run');
      return;
    }

    if (cmd === 'save-check') {
      await saveThenRunDevCommand('check');
      return;
    }

    if (cmd === 'save-build') {
      await saveThenRunDevCommand('build');
      return;
    }

    if (cmd === 'save-validate') {
      await saveThenRunDevCommand('validate');
      return;
    }

    if (cmd === 'save-install') {
      await saveThenRunDevCommand('install');
      return;
    }

    if (cmd === 'files') {
      const result = await refreshDevEditableFiles();

      if (isOk(result)) {
        const files = Array.isArray(result.files) ? result.files : [];
        devTerminalLog([
          `Editable files for ${result.projectName}:`,
          '',
          ...(files.length ? files.map(file => file.relativePath) : ['(none)'])
        ].join('\n'));
      } else {
        devTerminalLog(`Files failed: ${getError(result)}`);
      }

      return;
    }

    if (cmd === 'edit-main' || cmd === 'open-main') {
      await refreshDevEditableFiles('payload/main.js');
      const result = await openDevCodeFile('payload/main.js');

      devTerminalLog(
        isOk(result) ? 'Opened in Code Editor:' : 'Open failed:',
        isOk(result) ? result.relativePath : getError(result)
      );

      return;
    }

    if (cmd === 'edit-manifest' || cmd === 'open-manifest') {
      await refreshDevEditableFiles('quartz.json');
      const result = await openDevCodeFile('quartz.json');

      devTerminalLog(
        isOk(result) ? 'Opened in Code Editor:' : 'Open failed:',
        isOk(result) ? result.relativePath : getError(result)
      );

      return;
    }

    if (cmd === 'build') {
      const projectName = getSelectedDevProject();
      devTerminalLog(`Building selected project${projectName ? `: ${projectName}` : ''}...`);

      const result = await window.quartzAPI.devBuildQuartzPackage(projectName);
      rememberDevPackagePath(result);

      devTerminalLog(
        isOk(result) ? 'Build finished:' : 'Build finished with issues:',
        summarizeDevResult(result)
      );

      if (!isOk(result)) setStatus(`Build issue: ${getError(result, 'Validation found issues')}`);
      else setStatus('Package built successfully.');
      refreshDevProjectStatus();

      return;
    }

    if (cmd === 'validate') {
      const projectName = getSelectedDevProject();
      devTerminalLog(`Validating selected project${projectName ? `: ${projectName}` : ''}...`);

      const result = await window.quartzAPI.devValidateQuartzPackage(projectName);
      rememberDevPackagePath(result);

      devTerminalLog(
        isOk(result) ? 'Validation passed:' : 'Validation found issues:',
        summarizeDevResult(result)
      );

      if (!isOk(result)) setStatus(`Validation issue: ${getError(result, 'Validation found issues')}`);
      else setStatus('Package passed validation.');
      refreshDevProjectStatus();

      return;
    }

    if (cmd === 'test' || cmd === 'install') {
      const projectName = getSelectedDevProject();
      devTerminalLog(`Test installing selected project${projectName ? `: ${projectName}` : ''}...`);

      const result = await window.quartzAPI.devTestInstallLatestPackage(projectName);
      rememberDevPackagePath(result);

      devTerminalLog(
        isOk(result) ? 'Test install finished:' : 'Test install failed:',
        summarizeDevResult(result)
      );

      if (!isOk(result)) setStatus(`Test install failed: ${getError(result)}`);
      else setStatus('Selected project build test installed.');
      refreshDevProjectStatus();

      loadInstalledMods(true);
      return;
    }

    if (cmd === 'open') {
      const projectName = getSelectedDevProject();
      devTerminalLog(`Opening selected project${projectName ? `: ${projectName}` : ''}...`);

      const result = await window.quartzAPI.devOpenProjectFolder(projectName);

      devTerminalLog(
        isOk(result) ? 'Project folder opened:' : 'Project folder failed:',
        summarizeDevResult(result)
      );

      if (!isOk(result)) setStatus(`Open project failed: ${getError(result)}`);
      else setStatus('Project folder opened.');

      return;
    }

    const backendCommands = new Set(['status', 'ls', 'tree', 'manifest', 'check', 'run']);

    if (backendCommands.has(cmd)) {
      const result = await window.quartzAPI.devRunTerminalCommand(getSelectedDevProject(), cmd);

      if (isOk(result)) {
        devTerminalLog(result.output || result.message || 'Command finished.');
        setStatus(`Dev command finished: ${cmd}`);
      } else {
        devTerminalLog([
          `Command failed: ${raw}`,
          getError(result),
          result.output || ''
        ].filter(Boolean).join('\n'));
        setStatus(`Dev command failed: ${getError(result)}`);
      }

      return;
    }

    devTerminalLog(`Unknown command "${raw}". Type help to see available commands.`);
  }

  $('.dev-command-btn')?.addEventListener?.('click', () => {});

  $all('.dev-command-btn').forEach(button => {
    button.addEventListener('click', () => {
      runDevTerminalCommand(button.dataset.devCommand || '');
    });
  });

  $('#devTerminalRunBtn')?.addEventListener('click', () => {
    const input = $('#devTerminalInput');
    const command = input?.value || '';
    if (input) input.value = '';
    runDevTerminalCommand(command);
  });

  $('#devTerminalInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const input = event.target;
      const command = input.value || '';
      input.value = '';
      runDevTerminalCommand(command);
    }
  });

  $('#devTerminalClearBtn')?.addEventListener('click', () => {
    const out = $('#devTerminalOutput');
    if (out) out.textContent = 'Quartz Dev Terminal ready. Type help to see commands.';
    setStatus('Dev Terminal cleared.');
  });

  $('#devRefreshStatusBtn')?.addEventListener('click', async () => {
    await refreshDevProjectStatus(true);
  });

  $('#devPrepareSubmissionBtn')?.addEventListener('click', async () => {
    await prepareDevSubmission();
  });

  $('#devCreateFileBtn')?.addEventListener('click', async () => {
    await createDevCodeFile();
  });

  $('#devNewFileInput')?.addEventListener('keydown', async event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      await createDevCodeFile();
    }
  });

  $('#devCodeRefreshFilesBtn')?.addEventListener('click', async () => {
    const result = await refreshDevEditableFiles(getDevSelectedCodeFile());

    if (isOk(result)) {
      setStatus('Code editor file list refreshed.');
    } else {
      setStatus(`Refresh files failed: ${getError(result)}`);
    }
  });

  $('#devCodeOpenBtn')?.addEventListener('click', async () => {
    await openDevCodeFile();
  });

  $('#devCodeFileSelect')?.addEventListener('change', async () => {
    await openDevCodeFile();
  });

  $('#devCodeSaveBtn')?.addEventListener('click', async () => {
    await saveDevCodeFile();
  });

  $('#devCodeSaveRunBtn')?.addEventListener('click', async () => {
    await saveThenRunDevCommand('run');
  });

  $('#devCodeSaveCheckBtn')?.addEventListener('click', async () => {
    await saveThenRunDevCommand('check');
  });

  $('#devCodeSaveBuildBtn')?.addEventListener('click', async () => {
    await saveThenRunDevCommand('build');
  });

  $('#devCodeSaveValidateBtn')?.addEventListener('click', async () => {
    await saveThenRunDevCommand('validate');
  });

  $('#devCodeSaveInstallBtn')?.addEventListener('click', async () => {
    await saveThenRunDevCommand('install');
  });

  $('#devCodeEditor')?.addEventListener('input', event => {
    const editor = event.target;

    if (editor?.dataset?.relativePath) {
      editor.dataset.dirty = 'true';
      setDevCodeInfo(`Unsaved changes: ${editor.dataset.relativePath}`);
    }
  });

  $('#devCodeEditor')?.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveDevCodeFile();
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      saveThenRunDevCommand('run');
    }

    if (event.key === 'Tab') {
      event.preventDefault();

      const editor = event.target;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;

      editor.value = `${editor.value.slice(0, start)}  ${editor.value.slice(end)}`;
      editor.selectionStart = editor.selectionEnd = start + 2;
    }
  });

  $('#devProjectSelect')?.addEventListener('change', async () => {
    await refreshDevEditableFiles();
    await refreshDevProjectStatus();
  });



  $('#devClearConsoleBtn')?.addEventListener('click', () => {
    const consoleEl = $('#devConsole');
    if (consoleEl) consoleEl.textContent = 'Quartz Dev Console ready.';
    setStatus('Dev Console cleared.');
  });

  $('#devCopyConsoleBtn')?.addEventListener('click', async () => {
    const text = $('#devConsole')?.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Dev Console copied.');
    } catch (_error) {
      setStatus('Could not copy Dev Console.');
    }
  });

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
