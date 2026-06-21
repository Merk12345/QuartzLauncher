'use strict';

const state = {
  indexMods: [],
  allIndexMods: [],
  installedMods: [],
  installedUpdateMap: new Map(),
  installedUpdatesCheckedAt: null,
  installedUpdatesBusy: false,
  quartzProfiles: [],
  quartzProfilesBusy: false,
  indexSearch: '',
  indexTagFilter: '',
  indexSort: 'featured',
  indexPage: 1,
  selectedIndexModIds: new Set(),
  installedPage: 1,
  installedSearch: '',
  installedSort: 'name',
  selectedInstalledModIds: new Set(),
  installedBulkInProgress: false,
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
  if (pageId === 'settings') {
    updateSettings();
    loadQuartzProfiles(false);
  }
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

    .quartz-selected-count {
      padding: 8px 10px;
      border-radius: 999px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
      font-size: 12px;
      opacity: 0.9;
    }

    .quartz-index-select {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 10px;
      padding: 7px 9px;
      border-radius: 999px;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.12);
      font-size: 12px;
      cursor: pointer;
      user-select: none;
    }

    .quartz-index-select input {
      width: 16px;
      height: 16px;
      cursor: pointer;
    }

    .quartz-card.quartz-selected-card {
      border-color: rgba(102, 217, 255, 0.75);
      box-shadow: 0 0 0 1px rgba(102, 217, 255, 0.35), 0 16px 36px rgba(102, 217, 255, 0.10);
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

    .quartz-card.quartz-featured-card {
      border-color: rgba(255, 214, 10, 0.85);
      box-shadow: 0 0 0 1px rgba(255, 214, 10, 0.35), 0 16px 36px rgba(255, 214, 10, 0.10);
    }

    .quartz-featured-star {
      color: #ffd60a;
      text-shadow: 0 0 10px rgba(255, 214, 10, 0.45);
    }

    .quartz-pill.quartz-featured-pill {
      border-color: rgba(255, 214, 10, 0.7);
      background: rgba(255, 214, 10, 0.14);
      color: #ffe484;
      font-weight: 700;
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


    .quartz-tag-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 8px 0;
    }

    .quartz-pill.quartz-tag-pill {
      background: rgba(102,217,255,0.10);
      border-color: rgba(102,217,255,0.20);
      color: rgba(245,247,255,0.92);
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

    .quartz-index-sort {
      min-height: 40px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.08);
      color: rgba(245,247,255,0.95);
      padding: 9px 12px;
      outline: none;
    }

    .quartz-index-sort option {
      color: #111827;
    }

    .quartz-tag-filter-row {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      width: 100%;
      margin-top: 4px;
      margin-bottom: 8px;
    }

    .quartz-tag-filter-btn {
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.07);
      color: rgba(245,247,255,0.82);
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
    }

    .quartz-tag-filter-btn.active {
      border-color: rgba(102,217,255,0.75);
      background: rgba(102,217,255,0.18);
      color: #ffffff;
      font-weight: 700;
    }

    .quartz-details-modal[hidden] {
      display: none;
    }

    .quartz-details-modal {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: grid;
      place-items: center;
      background: rgba(0,0,0,0.68);
      padding: 22px;
    }

    .quartz-details-card {
      width: min(780px, 96vw);
      max-height: 88vh;
      overflow: auto;
      border-radius: 24px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(12,16,30,0.98);
      box-shadow: 0 24px 80px rgba(0,0,0,0.55);
      padding: 18px;
    }

    .quartz-details-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 14px;
    }

    .quartz-details-title {
      display: flex;
      gap: 13px;
      align-items: center;
    }

    .quartz-details-icon {
      width: 56px;
      height: 56px;
      border-radius: 16px;
      object-fit: cover;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
    }

    .quartz-details-title h2 {
      margin: 0;
      font-size: 22px;
    }

    .quartz-details-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin: 12px 0;
    }

    .quartz-details-row {
      padding: 9px 10px;
      border-radius: 14px;
      background: rgba(255,255,255,0.055);
      border: 1px solid rgba(255,255,255,0.08);
      font-size: 13px;
    }

    .quartz-details-row strong {
      display: block;
      color: rgba(245,247,255,0.70);
      font-size: 11px;
      margin-bottom: 3px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .quartz-details-section {
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid rgba(255,255,255,0.10);
    }

    .quartz-details-section h3 {
      margin: 0 0 7px;
      font-size: 15px;
    }

    .quartz-details-text {
      white-space: pre-wrap;
      color: rgba(245,247,255,0.82);
      font-size: 13px;
      line-height: 1.45;
    }

    @media (max-width: 720px) {
      .quartz-details-grid {
        grid-template-columns: 1fr;
      }
    }


    .quartz-index-debug {
      width: 100%;
      padding: 8px 10px;
      border-radius: 12px;
      border: 1px solid rgba(102,217,255,0.22);
      background: rgba(102,217,255,0.08);
      color: rgba(245,247,255,0.82);
      font-size: 12px;
      line-height: 1.35;
    }


    .quartz-installed-select {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 10px;
      padding: 7px 9px;
      border-radius: 999px;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.12);
      font-size: 12px;
      cursor: pointer;
      user-select: none;
    }

    .quartz-installed-select input {
      width: 16px;
      height: 16px;
      cursor: pointer;
    }

    .quartz-installed-sort {
      min-height: 40px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.08);
      color: rgba(245,247,255,0.95);
      padding: 9px 12px;
      outline: none;
    }

    .quartz-installed-sort option {
      color: #111827;
    }

    .quartz-bulk-progress {
      display: inline-flex;
      align-items: center;
      min-height: 18px;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid rgba(102,217,255,0.22);
      background: rgba(102,217,255,0.10);
      color: rgba(245,247,255,0.92);
      font-size: 12px;
    }

    .quartz-bulk-progress[hidden] {
      display: none;
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


function quartzWithTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(label || 'Operation timed out')), ms);
    })
  ]);
}

function updateIndexDebug(meta = {}, allCount = 0, installedCount = 0, availableCount = 0, error = '') {
  // Debug UI is hidden in normal builds. Keep this function as a safe no-op.
}

function getIndexModTags(mod) {
  return Array.isArray(mod?.tags)
    ? mod.tags.map(tag => String(tag || '').trim()).filter(Boolean)
    : [];
}

function indexModMatchesSearch(mod, search) {
  const query = String(search || '').trim().toLowerCase();

  if (!query) return true;

  const haystack = [
    getModId(mod),
    getModName(mod),
    mod.description,
    mod.developer,
    mod.author,
    mod.category,
    mod.engine,
    mod.type,
    mod.source,
    ...getIndexModTags(mod)
  ].join(' ').toLowerCase();

  return haystack.includes(query);
}

function indexModMatchesTag(mod, tag) {
  const wanted = String(tag || '').trim().toLowerCase();

  if (!wanted) return true;

  return getIndexModTags(mod).some(item => item.toLowerCase() === wanted);
}

function getIndexDateValue(mod, fields = []) {
  for (const field of fields) {
    const value = mod?.[field];

    if (!value) continue;

    const time = Date.parse(value);
    if (!Number.isNaN(time)) return time;
  }

  return 0;
}

function sortIndexMods(mods) {
  const sort = state.indexSort || 'featured';

  const byName = (a, b) => getModName(a).localeCompare(getModName(b));
  const byDeveloper = (a, b) => String(a.developer || a.author || '').localeCompare(String(b.developer || b.author || '')) || byName(a, b);
  const byCategory = (a, b) => String(a.category || '').localeCompare(String(b.category || '')) || byName(a, b);

  return [...mods].sort((a, b) => {
    if (sort === 'name') return byName(a, b);
    if (sort === 'developer') return byDeveloper(a, b);
    if (sort === 'category') return byCategory(a, b);

    if (sort === 'newest') {
      const aTime = getIndexDateValue(a, ['publishedAt', 'createdAt', 'approvedAt', 'date', 'addedAt']);
      const bTime = getIndexDateValue(b, ['publishedAt', 'createdAt', 'approvedAt', 'date', 'addedAt']);
      return (bTime - aTime) || byName(a, b);
    }

    if (sort === 'updated') {
      const aTime = getIndexDateValue(a, ['updatedAt', 'lastUpdated', 'modifiedAt', 'featuredAt']);
      const bTime = getIndexDateValue(b, ['updatedAt', 'lastUpdated', 'modifiedAt', 'featuredAt']);
      return (bTime - aTime) || byName(a, b);
    }

    const aFeatured = a.featured ? 1 : 0;
    const bFeatured = b.featured ? 1 : 0;

    if (aFeatured !== bFeatured) return bFeatured - aFeatured;

    const aRank = Number.isFinite(Number(a.featuredRank)) ? Number(a.featuredRank) : 999999;
    const bRank = Number.isFinite(Number(b.featuredRank)) ? Number(b.featuredRank) : 999999;

    return (aRank - bRank) || byName(a, b);
  });
}

function getIndexFilteredSortedMods() {
  const filtered = state.indexMods.filter(mod => {
    return indexModMatchesTag(mod, state.indexTagFilter) &&
      indexModMatchesSearch(mod, state.indexSearch);
  });

  return sortIndexMods(filtered);
}

function getIndexPageData() {
  const mods = getIndexFilteredSortedMods();
  const pageSize = Math.max(1, Number(state.pageSize || 12));
  const total = mods.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number(state.indexPage || 1)), totalPages);
  const start = (page - 1) * pageSize;

  return {
    mods: mods.slice(start, start + pageSize),
    page,
    total,
    totalPages
  };
}

function getPopularIndexTags() {
  const counts = new Map();

  state.indexMods.forEach(mod => {
    getIndexModTags(mod).forEach(tag => {
      const clean = String(tag || '').trim();
      if (!clean) return;

      const key = clean.toLowerCase();
      const existing = counts.get(key) || { tag: clean, count: 0 };
      existing.count += 1;
      counts.set(key, existing);
    });
  });

  const preferred = [
    'UI',
    'Gameplay',
    'Joke',
    'Utility',
    'Visual',
    'Editor',
    'Practice',
    'Performance',
    'Music',
    'Cosmetic',
    'Quality of Life',
    'Quartz Native',
    'Geode',
    'Geode Compatibility',
    'cheat',
    'offline'
  ];

  const preferredKeys = new Set(preferred.map(tag => tag.toLowerCase()));
  const preferredItems = preferred
    .map(tag => counts.get(tag.toLowerCase()))
    .filter(Boolean);

  const otherItems = [...counts.values()]
    .filter(item => !preferredKeys.has(item.tag.toLowerCase()))
    .sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag))
    .slice(0, 18);

  return [...preferredItems, ...otherItems];
}

function renderIndexTagFilters() {
  const host = $('#quartz-index-tag-filters');

  if (!host) return;

  const tags = getPopularIndexTags();

  if (!tags.length) {
    host.innerHTML = '';
    return;
  }

  const active = String(state.indexTagFilter || '').trim().toLowerCase();

  host.innerHTML = `
    <button class="quartz-tag-filter-btn ${!active ? 'active' : ''}" data-index-tag="">All Tags</button>
    ${tags.map(item => `
      <button class="quartz-tag-filter-btn ${active === item.tag.toLowerCase() ? 'active' : ''}" data-index-tag="${esc(item.tag)}">
        ${esc(item.tag)} <span class="muted">(${item.count})</span>
      </button>
    `).join('')}
  `;

  host.querySelectorAll('.quartz-tag-filter-btn').forEach(button => {
    button.addEventListener('click', () => {
      state.indexTagFilter = button.dataset.indexTag || '';
      state.indexPage = 1;
      renderIndex();
    });
  });
}

function clearIndexDiscoveryFilters() {
  state.indexSearch = '';
  state.indexTagFilter = '';
  state.indexSort = 'featured';
  state.indexPage = 1;

  const search = $('#quartz-index-search');
  const sort = $('#quartz-index-sort');

  if (search) search.value = '';
  if (sort) sort.value = state.indexSort;

  renderIndex();
  setStatus('Cleared Index search, tag filter, and sort.');
}

function closeQuartzModDetails() {
  const modal = $('#quartz-details-modal');

  if (modal) {
    modal.hidden = true;
  }
}

function ensureQuartzDetailsModal() {
  let modal = $('#quartz-details-modal');

  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'quartz-details-modal';
  modal.className = 'quartz-details-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="quartz-details-card" role="dialog" aria-modal="true" aria-label="Quartz mod details">
      <div class="quartz-details-header">
        <div id="quartz-details-heading"></div>
        <button class="secondary-btn small" id="quartz-details-close-btn">Close</button>
      </div>
      <div id="quartz-details-body"></div>
    </div>
  `;

  modal.addEventListener('click', event => {
    if (event.target === modal) closeQuartzModDetails();
  });

  document.body.appendChild(modal);

  $('#quartz-details-close-btn')?.addEventListener('click', closeQuartzModDetails);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeQuartzModDetails();
  });

  return modal;
}

function openQuartzModDetails(mod, mode = 'index') {
  const modal = ensureQuartzDetailsModal();
  const heading = $('#quartz-details-heading');
  const body = $('#quartz-details-body');

  if (!modal || !heading || !body) return;

  const id = getModId(mod);
  const name = getModName(mod);
  const icon = mod.iconDataUrl || mod.iconUrl || '';
  const tags = getIndexModTags(mod);
  const detailsText = mod.detailsText || mod.readme || mod.about || mod.description || '';
  const changelogText = mod.changelogText || mod.changelog || '';

  const rows = [
    ['ID', id],
    ['Developer', mod.developer || mod.author || 'Unknown'],
    ['Version', mod.version || 'Unknown'],
    ['Category', mod.category || 'Uncategorized'],
    ['Engine/Type', mod.engine || mod.type || 'Unknown'],
    ['Source', mod.source || mod.indexSource || 'Unknown'],
    ['Package', mod.packageFile || mod.packageUrl || mod.packagePath || ''],
    ['Status', mode === 'installed' || mod.installed ? 'Installed' : 'Available']
  ].filter(([, value]) => String(value || '').trim());

  heading.innerHTML = `
    <div class="quartz-details-title">
      ${icon ? `<img class="quartz-details-icon" src="${esc(icon)}" alt="">` : ''}
      <div>
        <h2>${esc(name)}</h2>
        <div class="muted">${esc(id)}</div>
      </div>
    </div>
  `;

  body.innerHTML = `
    <p>${esc(mod.description || 'No description provided.')}</p>

    ${tags.length ? `
      <div class="quartz-tag-row">
        ${tags.map(tag => `<span class="quartz-pill quartz-tag-pill">${esc(tag)}</span>`).join('')}
      </div>
    ` : ''}

    <div class="quartz-details-grid">
      ${rows.map(([label, value]) => `
        <div class="quartz-details-row">
          <strong>${esc(label)}</strong>
          <span>${esc(value)}</span>
        </div>
      `).join('')}
    </div>

    ${detailsText ? `
      <div class="quartz-details-section">
        <h3>Details</h3>
        <div class="quartz-details-text">${esc(detailsText)}</div>
      </div>
    ` : ''}

    ${changelogText ? `
      <div class="quartz-details-section">
        <h3>Changelog</h3>
        <div class="quartz-details-text">${esc(changelogText)}</div>
      </div>
    ` : ''}
  `;

  modal.hidden = false;
}


function getFilteredIndexModsForSelection() {
  return getIndexFilteredSortedMods();
}

function getShownIndexModsForSelection() {
  return getIndexPageData().mods;
}

function pruneSelectedIndexMods() {
  const availableIds = new Set(state.indexMods.map(getModId));
  state.selectedIndexModIds = new Set(
    [...state.selectedIndexModIds].filter(id => availableIds.has(id))
  );
}

function getSelectedIndexModIds() {
  pruneSelectedIndexMods();
  return [...state.selectedIndexModIds];
}

function updateIndexBulkUi() {
  const ids = getSelectedIndexModIds();
  const count = $('#quartz-index-selected-count');

  if (count) {
    count.textContent = `${ids.length} selected`;
  }

  const disabled = ids.length === 0;
  $('#quartz-clear-selected-index-btn')?.toggleAttribute('disabled', disabled);
  $('#quartz-install-selected-index-btn')?.toggleAttribute('disabled', disabled);
}

function setIndexModSelected(id, selected) {
  if (!id) return;

  if (selected) {
    state.selectedIndexModIds.add(String(id));
  } else {
    state.selectedIndexModIds.delete(String(id));
  }

  updateIndexBulkUi();
}

function selectShownIndexMods() {
  const shown = getShownIndexModsForSelection();

  shown.forEach(mod => {
    const id = getModId(mod);
    if (id) state.selectedIndexModIds.add(String(id));
  });

  renderIndex();
  setStatus(`Selected ${getSelectedIndexModIds().length} mod(s).`);
}

function clearSelectedIndexMods() {
  state.selectedIndexModIds.clear();
  renderIndex();
  setStatus('Cleared selected Index mods.');
}

function quartzDependencyIsOptional(dep) {
  if (!dep || typeof dep !== 'object') return false;

  if (dep.required === false) return true;
  if (dep.optional === true) return true;

  const importance = String(dep.importance || dep.type || dep.kind || '').toLowerCase();
  return ['optional', 'suggested', 'recommend', 'recommended'].includes(importance);
}

function quartzDependencyCleanId(value = '') {
  const id = String(value || '').trim();
  if (!id) return '';

  return id
    .replace(/^mod:/i, '')
    .replace(/^geode:/i, '')
    .replace(/^quartz:/i, '')
    .trim();
}

function quartzDependencyIdsFromValue(value, out = []) {
  if (!value) return out;

  if (typeof value === 'string') {
    const id = quartzDependencyCleanId(value);
    if (id) out.push(id);
    return out;
  }

  if (Array.isArray(value)) {
    value.forEach(item => quartzDependencyIdsFromValue(item, out));
    return out;
  }

  if (typeof value === 'object') {
    if (quartzDependencyIsOptional(value)) return out;

    const directId = quartzDependencyCleanId(
      value.id ||
      value.modId ||
      value.packageId ||
      value.slug ||
      value.name ||
      value.dependency ||
      ''
    );

    if (directId) {
      out.push(directId);
      return out;
    }

    // Support map-shaped dependencies: { "some.mod.id": ">=1.0.0" }
    Object.entries(value).forEach(([key, val]) => {
      const k = quartzDependencyCleanId(key);
      if (!k) return;

      const lower = k.toLowerCase();
      if (['version', 'importance', 'type', 'kind', 'required', 'optional'].includes(lower)) return;

      if (val && typeof val === 'object' && quartzDependencyIsOptional(val)) return;
      out.push(k);
    });
  }

  return out;
}

function getQuartzModDependencyIds(mod = {}) {
  const raw = [];

  quartzDependencyIdsFromValue(mod.dependencies, raw);
  quartzDependencyIdsFromValue(mod.depends, raw);
  quartzDependencyIdsFromValue(mod.requires, raw);
  quartzDependencyIdsFromValue(mod.requiredMods, raw);
  quartzDependencyIdsFromValue(mod.dependencyIds, raw);
  quartzDependencyIdsFromValue(mod.geodeDependencies, raw);
  quartzDependencyIdsFromValue(mod.geode?.dependencies, raw);
  quartzDependencyIdsFromValue(mod.manifest?.dependencies, raw);
  quartzDependencyIdsFromValue(mod.raw?.dependencies, raw);

  const selfId = getModId(mod);
  const seen = new Set();

  return raw
    .map(quartzDependencyCleanId)
    .filter(Boolean)
    .filter(id => id !== selfId)
    .filter(id => {
      const key = id.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getQuartzKnownIndexModsForDependencies() {
  const mods = [];

  if (Array.isArray(state.allIndexMods)) mods.push(...state.allIndexMods);
  if (Array.isArray(state.indexMods)) mods.push(...state.indexMods);

  const byId = new Map();

  mods.forEach(mod => {
    const id = getModId(mod);
    if (!id || byId.has(id)) return;
    byId.set(id, mod);
  });

  return [...byId.values()];
}

function getQuartzIndexModById(packageId) {
  const wanted = String(packageId || '').trim();
  if (!wanted) return null;

  return getQuartzKnownIndexModsForDependencies()
    .find(mod => getModId(mod) === wanted) || null;
}

async function ensureQuartzIndexForDependencyHandling() {
  if (Array.isArray(state.allIndexMods) && state.allIndexMods.length) return state.allIndexMods;

  let result = null;

  if (window.quartzAPI?.getPublicIndexLocal) {
    result = await Promise.race([
      window.quartzAPI.getPublicIndexLocal(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Local index timed out')), 10000))
    ]);
  } else if (window.quartzAPI?.getQuartzIndex) {
    result = await window.quartzAPI.getQuartzIndex({ page: 1, pageSize: 5000, category: 'All' });
  } else {
    return [];
  }

  state.allIndexMods = normalizeIndexMods(result);
  return state.allIndexMods;
}

async function getQuartzInstalledIdSetForDependencies() {
  try {
    const result = await window.quartzAPI.getInstalledMods();
    state.installedMods = normalizeInstalledMods(result);
  } catch (_) {}

  return new Set(
    (state.installedMods || [])
      .map(getModId)
      .filter(Boolean)
  );
}

async function installQuartzPackageWithDependencies(packageId, options = {}) {
  const targetId = String(packageId || '').trim();

  if (!targetId) {
    return {
      ok: false,
      error: 'Missing package id.'
    };
  }

  if (!window.quartzAPI?.installQuartzPackage) {
    return {
      ok: false,
      error: 'Install API is not connected. Restart Quartz Launcher and try again.'
    };
  }

  await ensureQuartzIndexForDependencyHandling();

  const installedIds = await getQuartzInstalledIdSetForDependencies();
  const visited = new Set();
  const visiting = new Set();
  const dependenciesInstalled = [];
  const dependenciesAlreadyInstalled = [];
  const missingDependencies = [];
  const failedDependencies = [];

  const installOne = async (id, isTarget = false) => {
    id = String(id || '').trim();

    if (!id) return { ok: true, skipped: true };
    if (visited.has(id)) return { ok: true, skipped: true };

    if (visiting.has(id)) {
      return {
        ok: false,
        error: `Dependency loop detected at ${id}`
      };
    }

    visiting.add(id);

    const alreadyInstalled = installedIds.has(id);

    if (alreadyInstalled && !(isTarget && options.forceTarget)) {
      if (!isTarget) {
        dependenciesAlreadyInstalled.push(id);

        try {
          if (window.quartzAPI?.enableQuartzMod) {
            await window.quartzAPI.enableQuartzMod(id);
          }
        } catch (_) {}
      }

      visiting.delete(id);
      visited.add(id);
      return { ok: true, skipped: true, alreadyInstalled: true };
    }

    const indexMod = getQuartzIndexModById(id);
    const deps = getQuartzModDependencyIds(indexMod || { id });

    for (const depId of deps) {
      if (depId === id) continue;

      if (!getQuartzIndexModById(depId) && !installedIds.has(depId)) {
        missingDependencies.push({
          for: id,
          dependency: depId
        });
        continue;
      }

      const depResult = await installOne(depId, false);

      if (!depResult?.ok) {
        failedDependencies.push({
          for: id,
          dependency: depId,
          error: getError(depResult)
        });
      }
    }

    const label = indexMod?.name || id;
    if (!options.quietDependencies) {
      setStatus(isTarget ? `Installing ${label}...` : `Installing dependency ${label}...`);
    }

    const result = await window.quartzAPI['installQuartzPackage'](id);

    if (result?.ok) {
      installedIds.add(id);

      if (!isTarget) {
        dependenciesInstalled.push(id);

        try {
          if (window.quartzAPI?.enableQuartzMod) {
            await window.quartzAPI.enableQuartzMod(id);
          }
        } catch (_) {}
      }
    }

    visiting.delete(id);
    visited.add(id);
    return result;
  };

  const result = await installOne(targetId, true);

  return {
    ...(result || {}),
    ok: !!result?.ok,
    dependencyHandling: true,
    dependenciesInstalled,
    dependenciesAlreadyInstalled,
    missingDependencies,
    failedDependencies
  };
}

function quartzDependencySummaryFromResult(result = {}) {
  const installed = Array.isArray(result.dependenciesInstalled) ? result.dependenciesInstalled.length : 0;
  const missing = Array.isArray(result.missingDependencies) ? result.missingDependencies.length : 0;
  const failed = Array.isArray(result.failedDependencies) ? result.failedDependencies.length : 0;

  const parts = [];
  if (installed) parts.push(`${installed} dependenc${installed === 1 ? 'y' : 'ies'} installed`);
  if (missing) parts.push(`${missing} missing dependenc${missing === 1 ? 'y' : 'ies'}`);
  if (failed) parts.push(`${failed} dependency error${failed === 1 ? '' : 's'}`);

  return parts.join(', ');
}

async function installSelectedIndexMods(event) {
  const ids = getSelectedIndexModIds();

  if (!ids.length) {
    setStatus('Select at least one Index mod first.');
    return;
  }

  const confirmed = confirm(`Install ${ids.length} selected mod(s)?\n\nQuartz will install them one at a time.`);
  if (!confirmed) {
    setStatus('Install selected canceled.');
    return;
  }

  const btn = event?.currentTarget || $('#quartz-install-selected-index-btn');
  const originalText = btn?.textContent || 'Install Selected';

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Installing...';
  }

  const failures = [];
  let installed = 0;

  try {
    for (const id of ids) {
      const mod = state.indexMods.find(item => getModId(item) === id);
      const name = mod ? getModName(mod) : id;

      setStatus(`Installing ${installed + 1}/${ids.length}: ${name}`);

      try {
        const result = await installQuartzPackageWithDependencies(id);

        if (!isOk(result)) {
          failures.push(`${name}: ${getError(result)}`);
        } else {
          installed += 1;
          state.selectedIndexModIds.delete(id);
        }
      } catch (error) {
        failures.push(`${name}: ${error.message || error}`);
      }
    }

    await refreshAll();

    if (failures.length) {
      alert(`Installed ${installed}/${ids.length} selected mod(s).\n\nFailed:\n${failures.join('\n')}`);
      setStatus(`Installed ${installed}/${ids.length} selected mod(s), with ${failures.length} failure(s).`);
    } else {
      alert(`Installed ${installed} selected mod(s).`);
      setStatus(`Installed ${installed} selected mod(s).`);
    }
  } finally {
    if (btn && document.body.contains(btn)) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}


function createModCard(mod, mode) {
  const id = getModId(mod);
  const name = getModName(mod);
  const version = mod.version || 'unknown';
  const developer = mod.developer || mod.author || 'unknown';
  const engine = mod.engine || mod.type || 'unknown';
  const description = mod.description || 'No description provided.';
  const enabled = modIsEnabled(mod);
  const featured = mode === 'index' && !!mod.featured;
  const displayTags = Array.isArray(mod.tags)
    ? mod.tags.map(tag => String(tag || '').trim()).filter(Boolean).slice(0, 8)
    : [];
  const selected = mode === 'index' && state.selectedIndexModIds.has(String(id));

  const card = document.createElement('div');
  card.className = `mod-card quartz-card${featured ? ' quartz-featured-card' : ''}${selected ? ' quartz-selected-card' : ''}`;
  card.dataset.modId = id;

  const actionHtml = mode === 'installed'
    ? `
      <button class="secondary-btn small quartz-details-btn">Details</button>
    <button class="secondary-btn small quartz-toggle-btn">${enabled ? 'Disable' : 'Enable'}</button>
      <button class="secondary-btn small quartz-uninstall-btn quartz-danger">Uninstall</button>
    `
    : `
      <button class="secondary-btn small quartz-details-btn">Details</button>
    <button class="primary-btn small quartz-install-btn">Install</button>
    `;

  card.innerHTML = `
    ${mode === 'index' ? `
      <label class="quartz-index-select" title="Select this mod for bulk install">
        <input class="quartz-index-select-input" type="checkbox" ${selected ? 'checked' : ''} />
        <span>Select</span>
      </label>
    ` : ''}
    <h3>${featured ? '<span class="quartz-featured-star" title="Featured">★</span> ' : ''}${esc(name)}</h3>
    <div class="quartz-meta">
      ${featured ? '<span class="quartz-pill quartz-featured-pill">★ Featured</span>' : ''}
      <span class="quartz-pill">${esc(engine)}</span>
      <span class="quartz-pill">v${esc(version)}</span>
      <span class="quartz-pill">${mode === 'installed' ? (enabled ? 'Enabled' : 'Disabled') : 'Available'}</span>
    </div>
    <p>${esc(description)}</p>
    ${displayTags.length ? `
      <div class="quartz-tag-row">
        ${displayTags.map(tag => `<span class="quartz-pill quartz-tag-pill">${esc(tag)}</span>`).join('')}
      </div>
    ` : ''}
    <p><strong>Developer:</strong> ${esc(developer)}</p>
    <div class="quartz-actions">
      ${actionHtml}
    </div>
  `;

  if (mode === 'installed') {
    const installedSelected = state.selectedInstalledModIds.has(String(id));
    card.classList.toggle('quartz-selected-card', installedSelected);
    card.insertAdjacentHTML('afterbegin', `
      <label class="quartz-installed-select" title="Select this installed mod for bulk actions">
        <input class="quartz-installed-select-input" type="checkbox" ${installedSelected ? 'checked' : ''} />
        <span>Select</span>
      </label>
    `);
  }

  card.querySelector('.quartz-installed-select-input')?.addEventListener('change', event => {
    setInstalledModSelected(id, event.currentTarget.checked);
    card.classList.toggle('quartz-selected-card', event.currentTarget.checked);
  });

  card.querySelector('.quartz-details-btn')?.addEventListener('click', event => {
    event.preventDefault();
    openQuartzModDetails(mod, mode);
  });

  card.querySelector('.quartz-index-select-input')?.addEventListener('change', event => {
    setIndexModSelected(id, event.currentTarget.checked);
    card.classList.toggle('quartz-selected-card', event.currentTarget.checked);
  });

  card.querySelector('.quartz-install-btn')?.addEventListener('click', async event => {
    const btn = event.currentTarget;
    const originalText = btn.textContent || 'Install';

    btn.disabled = true;
    btn.textContent = 'Installing...';

    try {
      const result = await installQuartzPackageWithDependencies(id);

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
  const grid = $('#indexGrid');

  if (!grid) return;

  let tools = $('#quartz-index-tools');

  if (!tools) {
    tools = document.createElement('div');
    tools.id = 'quartz-index-tools';
    tools.className = 'quartz-toolbar';
    grid.parentElement.insertBefore(tools, grid);
  }

  tools.innerHTML = `
    <input id="quartz-index-search" class="quartz-search" placeholder="Search Quartz mods..." />
    <select id="quartz-index-sort" class="quartz-index-sort" title="Sort Index mods">
      <option value="featured">Featured First</option>
      <option value="newest">Newest</option>
      <option value="updated">Recently Updated</option>
      <option value="name">A-Z</option>
      <option value="developer">Developer</option>
      <option value="category">Category</option>
    </select>
    <button class="secondary-btn small" id="quartz-clear-index-filters-btn">Clear Filters</button>
    <span id="quartz-index-selected-count" class="quartz-selected-count">0 selected</span>
    <span id="quartz-index-install-progress" class="quartz-index-install-progress" hidden></span>
    <button class="secondary-btn small" id="quartz-select-shown-index-btn">Select Shown</button>
    <button class="secondary-btn small" id="quartz-select-results-index-btn">Select Results</button>
    <button class="secondary-btn small" id="quartz-clear-selected-index-btn" disabled>Clear Selected</button>
    <button class="primary-btn small" id="quartz-install-selected-index-btn" disabled>Install Selected</button>
    <button class="secondary-btn small" id="quartz-refresh-index-btn">Refresh Index</button>
    <button class="secondary-btn small" id="quartz-scan-mods-folder-btn">Scan Mods Folder</button>
    <button class="secondary-btn small" id="quartz-open-mods-folder-btn">Open Mods Folder</button>
    <div id="quartz-index-tag-filters" class="quartz-tag-filter-row"></div>
  `;

  const searchInput = $('#quartz-index-search');
  const sortSelect = $('#quartz-index-sort');

  if (searchInput) {
    searchInput.value = state.indexSearch || '';
    searchInput.addEventListener('input', event => {
      state.indexSearch = event.target.value || '';
      state.indexPage = 1;
      renderIndex();
    });
  }

  if (sortSelect) {
    sortSelect.value = state.indexSort || 'featured';
    sortSelect.addEventListener('change', event => {
      state.indexSort = event.target.value || 'featured';
      state.indexPage = 1;
      renderIndex();
    });
  }

  $('#quartz-clear-index-filters-btn')?.addEventListener('click', clearIndexDiscoveryFilters);
  $('#quartz-select-shown-index-btn')?.addEventListener('click', selectShownIndexMods);
  $('#quartz-select-results-index-btn')?.addEventListener('click', selectFilteredIndexMods);
  $('#quartz-clear-selected-index-btn')?.addEventListener('click', clearSelectedIndexMods);
  $('#quartz-install-selected-index-btn')?.addEventListener('click', installSelectedIndexMods);
  $('#quartz-refresh-index-btn')?.addEventListener('click', refreshQuartzIndex);
  $('#quartz-scan-mods-folder-btn')?.addEventListener('click', autoScanQuartzModsFolder);
  $('#quartz-open-mods-folder-btn')?.addEventListener('click', openQuartzModsFolder);

  updateIndexBulkUi();
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
  setStatus('Loading Quartz Index...');

  if (typeof updateIndexDebug === 'function') {
    updateIndexDebug({}, 0, 0, 0, 'Loading public index...');
  }

  try {
    let indexResult = null;

    if (window.quartzAPI.getPublicIndexLocal) {
      indexResult = await quartzWithTimeout(
        window.quartzAPI.getPublicIndexLocal(),
        5000,
        'Clean local public index timed out.'
      );
    } else {
      indexResult = await quartzWithTimeout(
        window.quartzAPI.getQuartzIndex({ page: 1, pageSize: 5000, category: 'All' }),
        5000,
        'Legacy Quartz index timed out.'
      );
    }

    if (!isOk(indexResult)) {
      throw new Error(getError(indexResult));
    }

    const allMods = normalizeIndexMods(indexResult);
    const meta = indexResult?.index?.meta || {};

    if (typeof updateIndexDebug === 'function') {
      updateIndexDebug(meta, allMods.length, 0, allMods.length, 'Public index loaded. Checking installed mods...');
    }

    let installed = [];

    try {
      const installedResult = await quartzWithTimeout(
        window.quartzAPI.getInstalledMods(),
        5000,
        'Installed mods check timed out.'
      );

      installed = normalizeInstalledMods(installedResult);
    } catch (installedError) {
      console.warn('[Quartz Index] Installed mods check failed:', installedError);
      setStatus(`Index loaded, but installed-mod filter failed: ${installedError.message || installedError}`);
    }

    const installedIds = new Set(installed.map(getModId).filter(Boolean));

    state.indexMods = allMods.filter(mod => {
      const id = getModId(mod);
      return id && !installedIds.has(id);
    });

    console.log('[Quartz Index Load]', {
      receivedFromBackend: allMods.length,
      installedFromModsPage: installedIds.size,
      availableAfterFrontendFilter: state.indexMods.length,
      backendMeta: meta
    });

    setStatus(`Index loaded: ${state.indexMods.length} available / ${allMods.length} total. Source: ${meta.source || 'unknown'}`);

    if (typeof updateIndexDebug === 'function') {
      updateIndexDebug(meta, allMods.length, installedIds.size, state.indexMods.length);
    }

    pruneSelectedIndexMods();
    renderIndex();
  } catch (error) {
    console.error('[Quartz Index] load failed:', error);

    state.indexMods = [];

    setStatus(`Failed to load Quartz Index: ${error.message || error}`);

    if (typeof updateIndexDebug === 'function') {
      updateIndexDebug({}, 0, 0, 0, error.message || String(error));
    }

    renderIndex();
  }
}

function renderIndex() {
  const grid = $('#indexGrid');
  if (!grid) return;

  const pageData = getIndexPageData();
  state.indexPage = pageData.page;

  grid.classList.add('quartz-grid');
  grid.innerHTML = '';

  if (state.indexMods.length === 0) {
    grid.innerHTML = `
      <div class="quartz-empty">
        <h3>No available Index mods shown</h3>
        <p>Quartz did not receive any available Index mods to show. Try Refresh Index, or check the terminal for index loading errors.</p>
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

  updateIndexBulkUi();
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


// ===== Quartz Installed Bulk UI START =====
function getInstalledFilterHaystack(mod) {
  return [
    getModId(mod),
    getModName(mod),
    mod.description,
    mod.developer,
    mod.author,
    mod.category,
    mod.engine,
    mod.type,
    mod.source,
    modIsEnabled(mod) ? 'enabled' : 'disabled',
    ...(Array.isArray(mod.tags) ? mod.tags : [])
  ].join(' ').toLowerCase();
}

function sortInstalledMods(mods) {
  const sort = state.installedSort || 'name';
  const byName = (a, b) => getModName(a).localeCompare(getModName(b));

  return [...mods].sort((a, b) => {
    if (sort === 'enabled') {
      const ae = modIsEnabled(a) ? 1 : 0;
      const be = modIsEnabled(b) ? 1 : 0;
      return (be - ae) || byName(a, b);
    }

    if (sort === 'disabled') {
      const ae = modIsEnabled(a) ? 1 : 0;
      const be = modIsEnabled(b) ? 1 : 0;
      return (ae - be) || byName(a, b);
    }

    if (sort === 'developer') {
      return String(a.developer || a.author || '').localeCompare(String(b.developer || b.author || '')) || byName(a, b);
    }

    if (sort === 'engine') {
      return String(a.engine || a.type || '').localeCompare(String(b.engine || b.type || '')) || byName(a, b);
    }

    return byName(a, b);
  });
}

function getInstalledFilteredMods() {
  const query = String(state.installedSearch || '').trim().toLowerCase();

  const filtered = query
    ? state.installedMods.filter(mod => getInstalledFilterHaystack(mod).includes(query))
    : [...state.installedMods];

  return sortInstalledMods(filtered);
}

function getInstalledPageData() {
  const mods = getInstalledFilteredMods();
  const pageSize = Math.max(1, Number(state.pageSize || 12));
  const total = mods.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number(state.installedPage || 1)), totalPages);
  const start = (page - 1) * pageSize;

  return {
    mods: mods.slice(start, start + pageSize),
    page,
    total,
    totalPages
  };
}

function pruneSelectedInstalledMods() {
  const installedIds = new Set(state.installedMods.map(getModId).filter(Boolean));
  state.selectedInstalledModIds = new Set(
    [...state.selectedInstalledModIds].filter(id => installedIds.has(id))
  );
}

function getSelectedInstalledModIds() {
  pruneSelectedInstalledMods();
  return [...state.selectedInstalledModIds];
}

function updateInstalledBulkUi() {
  const ids = getSelectedInstalledModIds();
  const busy = !!state.installedBulkInProgress;
  const count = $('#quartz-installed-selected-count');
  const noneSelected = ids.length === 0;

  if (count) {
    count.textContent = `${ids.length} selected`;
  }

  $('#quartz-installed-select-shown-btn')?.toggleAttribute('disabled', busy);
  $('#quartz-installed-select-results-btn')?.toggleAttribute('disabled', busy);
  $('#quartz-installed-clear-selected-btn')?.toggleAttribute('disabled', noneSelected || busy);
  $('#quartz-installed-enable-selected-btn')?.toggleAttribute('disabled', noneSelected || busy);
  $('#quartz-installed-disable-selected-btn')?.toggleAttribute('disabled', noneSelected || busy);
  $('#quartz-installed-uninstall-selected-btn')?.toggleAttribute('disabled', noneSelected || busy);
  $('#quartz-installed-export-btn')?.toggleAttribute('disabled', busy || state.installedMods.length === 0);

  const updateCount = state.installedUpdateMap?.size || 0;
  const selectedUpdateCount = getSelectedInstalledModIds()
    .filter(id => state.installedUpdateMap?.has?.(id))
    .length;

  $('#quartz-check-updates-btn')?.toggleAttribute('disabled', busy || state.installedMods.length === 0);
  $('#quartz-update-all-btn')?.toggleAttribute('disabled', busy || updateCount === 0);
  $('#quartz-update-selected-btn')?.toggleAttribute('disabled', busy || selectedUpdateCount === 0);
  updateInstalledUpdateSummary();
}

function setInstalledBulkProgress(text = '') {
  const progress = $('#quartz-installed-bulk-progress');

  if (!progress) return;

  progress.textContent = text;
  progress.hidden = !text;
}

function setInstalledModSelected(id, selected) {
  if (!id) return;

  if (selected) {
    state.selectedInstalledModIds.add(String(id));
  } else {
    state.selectedInstalledModIds.delete(String(id));
  }

  updateInstalledBulkUi();
}

function selectShownInstalledMods() {
  getInstalledPageData().mods.forEach(mod => {
    const id = getModId(mod);
    if (id) state.selectedInstalledModIds.add(String(id));
  });

  renderInstalledMods();
  setStatus(`Selected ${getSelectedInstalledModIds().length} installed mod(s).`);
}

function selectFilteredInstalledMods() {
  getInstalledFilteredMods().forEach(mod => {
    const id = getModId(mod);
    if (id) state.selectedInstalledModIds.add(String(id));
  });

  renderInstalledMods();
  setStatus(`Selected ${getSelectedInstalledModIds().length} installed mod(s) from current results.`);
}

function clearSelectedInstalledMods() {
  state.selectedInstalledModIds.clear();
  renderInstalledMods();
  setStatus('Cleared selected installed mods.');
}

async function runInstalledBulkAction(action) {
  const ids = getSelectedInstalledModIds();

  if (!ids.length) {
    setStatus('Select at least one installed mod first.');
    return;
  }

  const actionLabel =
    action === 'enable' ? 'enable' :
    action === 'disable' ? 'disable' :
    action === 'uninstall' ? 'uninstall' :
    action;

  const confirmed = confirm(
    `Bulk ${actionLabel} ${ids.length} selected installed mod(s)?` +
    (action === 'uninstall' ? '\n\nThis removes them from Quartz.' : '')
  );

  if (!confirmed) {
    setStatus(`Bulk ${actionLabel} canceled.`);
    return;
  }

  const fn =
    action === 'enable' ? window.quartzAPI.enableQuartzMod :
    action === 'disable' ? window.quartzAPI.disableQuartzMod :
    action === 'uninstall' ? window.quartzAPI.uninstallQuartzPackage :
    null;

  if (typeof fn !== 'function') {
    alert(`Bulk ${actionLabel} is not connected. Restart Quartz and try again.`);
    return;
  }

  const failures = [];
  let completed = 0;

  state.installedBulkInProgress = true;
  updateInstalledBulkUi();

  try {
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      const mod = state.installedMods.find(item => getModId(item) === id);
      const name = mod ? getModName(mod) : id;
      const progressText = `${actionLabel[0].toUpperCase() + actionLabel.slice(1)} ${index + 1}/${ids.length}: ${name}`;

      setStatus(progressText);
      setInstalledBulkProgress(progressText);

      try {
        const result = await fn(id);

        if (!isOk(result)) {
          failures.push(`${name}: ${getError(result)}`);
        } else {
          completed += 1;

          if (action === 'uninstall') {
            state.selectedInstalledModIds.delete(id);
          }
        }
      } catch (error) {
        failures.push(`${name}: ${error.message || error}`);
      }
    }

    setInstalledBulkProgress('Refreshing installed mods...');

    if (typeof refreshAll === 'function') {
      await refreshAll();
    } else {
      await loadInstalledMods(false);
    }

    if (failures.length) {
      alert(`Bulk ${actionLabel} completed ${completed}/${ids.length} mod(s).\n\nFailed:\n${failures.join('\n')}`);
      setStatus(`Bulk ${actionLabel}: ${completed}/${ids.length} completed, ${failures.length} failed.`);
    } else {
      alert(`Bulk ${actionLabel} completed for ${completed} mod(s).`);
      setStatus(`Bulk ${actionLabel} completed for ${completed} mod(s).`);
    }
  } finally {
    state.installedBulkInProgress = false;
    setInstalledBulkProgress('');
    updateInstalledBulkUi();
  }
}

function quartzUpdateCleanVersion(value = '') {
  return String(value || '')
    .trim()
    .replace(/^v/i, '')
    .replace(/\+.*$/, '')
    .replace(/\s+/g, '');
}

function quartzUpdateVersionParts(value = '') {
  const clean = quartzUpdateCleanVersion(value);
  if (!clean) return [];

  return clean
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(part => {
      if (/^\d+$/.test(part)) return Number(part);
      return part.toLowerCase();
    });
}

function quartzCompareVersions(a = '', b = '') {
  const av = quartzUpdateVersionParts(a);
  const bv = quartzUpdateVersionParts(b);

  if (!av.length && !bv.length) return 0;
  if (!av.length) return -1;
  if (!bv.length) return 1;

  const len = Math.max(av.length, bv.length);

  for (let i = 0; i < len; i += 1) {
    const left = av[i] ?? 0;
    const right = bv[i] ?? 0;

    if (typeof left === 'number' && typeof right === 'number') {
      if (left !== right) return left > right ? 1 : -1;
      continue;
    }

    const l = String(left);
    const r = String(right);
    if (l !== r) return l > r ? 1 : -1;
  }

  return 0;
}

function quartzModVersion(mod = {}) {
  return quartzUpdateCleanVersion(
    mod.version ||
    mod.latestVersion ||
    mod.modVersion ||
    mod.packageVersion ||
    mod.tag ||
    ''
  );
}

function quartzInstalledModIsEnabled(mod = {}) {
  if (mod.enabled === false) return false;
  if (mod.disabled === true) return false;
  if (mod.isDisabled === true) return false;
  return true;
}

async function quartzLoadIndexForUpdateCheck() {
  let result = null;

  if (window.quartzAPI?.getPublicIndexLocal) {
    result = await Promise.race([
      window.quartzAPI.getPublicIndexLocal(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Local index timed out')), 10000))
    ]);
  } else if (window.quartzAPI?.getQuartzIndex) {
    result = await window.quartzAPI.getQuartzIndex({ page: 1, pageSize: 5000, category: 'All' });
  } else {
    throw new Error('No Quartz Index API is available.');
  }

  const mods = normalizeIndexMods(result);
  const byId = new Map();

  for (const mod of mods) {
    const id = getModId(mod);
    if (!id) continue;

    const old = byId.get(id);
    if (!old) {
      byId.set(id, mod);
      continue;
    }

    const oldVersion = quartzModVersion(old);
    const newVersion = quartzModVersion(mod);
    if (quartzCompareVersions(oldVersion, newVersion) < 0) {
      byId.set(id, mod);
    }
  }

  return byId;
}

function getInstalledUpdateCandidates() {
  return [...(state.installedUpdateMap || new Map()).values()];
}

function updateInstalledUpdateSummary() {
  const el = $('#quartz-installed-update-summary');
  if (!el) return;

  const count = state.installedUpdateMap?.size || 0;

  if (state.installedUpdatesBusy) {
    el.textContent = 'Checking updates...';
    return;
  }

  if (!state.installedUpdatesCheckedAt) {
    el.textContent = 'Updates not checked yet.';
    return;
  }

  if (count === 0) {
    el.textContent = `No updates found. Checked ${new Date(state.installedUpdatesCheckedAt).toLocaleTimeString()}.`;
    return;
  }

  el.textContent = `${count} update(s) available. Checked ${new Date(state.installedUpdatesCheckedAt).toLocaleTimeString()}.`;
}

async function checkInstalledModUpdates(options = {}) {
  const quiet = !!options.quiet;

  if (!window.quartzAPI?.getInstalledMods) {
    alert('Installed Mods API is not connected. Restart Quartz Launcher and try again.');
    return [];
  }

  try {
    state.installedUpdatesBusy = true;
    updateInstalledBulkUi();
    if (!quiet) setStatus('Checking installed mods for updates...');

    if (!Array.isArray(state.installedMods) || state.installedMods.length === 0) {
      const installedResult = await window.quartzAPI.getInstalledMods();
      state.installedMods = normalizeInstalledMods(installedResult);
    }

    const indexById = await quartzLoadIndexForUpdateCheck();
    const updates = [];

    for (const installed of state.installedMods || []) {
      const id = getModId(installed);
      if (!id) continue;

      const latest = indexById.get(id);
      if (!latest) continue;

      const installedVersion = quartzModVersion(installed);
      const latestVersion = quartzModVersion(latest);

      if (!installedVersion || !latestVersion) continue;

      if (quartzCompareVersions(installedVersion, latestVersion) < 0) {
        updates.push({
          id,
          installed,
          latest,
          installedVersion,
          latestVersion,
          wasEnabled: quartzInstalledModIsEnabled(installed)
        });
      }
    }

    state.installedUpdateMap = new Map(updates.map(item => [item.id, item]));
    state.installedUpdatesCheckedAt = Date.now();

    updateInstalledBulkUi();
    renderInstalledMods();

    const message = updates.length
      ? `Found ${updates.length} update(s).`
      : 'No installed mod updates found.';

    if (!quiet) setStatus(message);

    return updates;
  } catch (error) {
    console.error('[Quartz Updates] check failed:', error);
    if (!quiet) alert(`Update check failed:\n${error.message || error}`);
    setStatus(`Update check failed: ${error.message || error}`);
    return [];
  } finally {
    state.installedUpdatesBusy = false;
    updateInstalledBulkUi();
    updateInstalledUpdateSummary();
  }
}

async function updateInstalledModsByIds(ids = []) {
  const uniqueIds = [...new Set(ids.map(id => String(id || '').trim()).filter(Boolean))];

  if (!uniqueIds.length) {
    setStatus('No mods selected for update.');
    return;
  }

  if (!state.installedUpdateMap || state.installedUpdateMap.size === 0) {
    await checkInstalledModUpdates({ quiet: true });
  }

  const candidates = uniqueIds
    .map(id => state.installedUpdateMap.get(id))
    .filter(Boolean);

  if (!candidates.length) {
    alert('None of the selected mods have detected updates.');
    return;
  }

  const ok = confirm(`Update ${candidates.length} mod(s)?\n\nQuartz will reinstall the latest package and preserve each mod's enabled/disabled state.`);
  if (!ok) return;

  let updated = 0;
  const failed = [];

  state.installedUpdatesBusy = true;
  updateInstalledBulkUi();

  for (const candidate of candidates) {
    const id = candidate.id;
    const wasEnabled = !!candidate.wasEnabled;

    try {
      setStatus(`Updating ${candidate.installed?.name || candidate.latest?.name || id}...`);

      const result = await installQuartzPackageWithDependencies(id, { forceTarget: true, quietDependencies: true });

      if (!result?.ok) {
        failed.push(`${id}: ${getError(result)}`);
        continue;
      }

      try {
        if (wasEnabled) {
          await window.quartzAPI.enableQuartzMod(id);
        } else {
          await window.quartzAPI.disableQuartzMod(id);
        }
      } catch (stateError) {
        failed.push(`${id}: updated, but enabled/disabled restore failed: ${stateError.message || stateError}`);
      }

      updated += 1;
      state.installedUpdateMap.delete(id);
      state.selectedInstalledModIds?.delete?.(id);
    } catch (error) {
      failed.push(`${id}: ${error.message || error}`);
    }
  }

  state.installedUpdatesBusy = false;

  await loadInstalledMods(false);
  await checkInstalledModUpdates({ quiet: true });

  const msg = `Updated ${updated} mod(s).${failed.length ? ` ${failed.length} failed.` : ''}`;
  setStatus(msg);

  if (failed.length) {
    alert(`${msg}\n\n${failed.join('\n')}`);
  }
}

async function updateAllInstalledMods() {
  if (!state.installedUpdateMap || state.installedUpdateMap.size === 0) {
    await checkInstalledModUpdates({ quiet: true });
  }

  const ids = [...(state.installedUpdateMap || new Map()).keys()];

  if (!ids.length) {
    alert('No updates available.');
    return;
  }

  await updateInstalledModsByIds(ids);
}

async function updateSelectedInstalledMods() {
  const ids = getSelectedInstalledModIds();

  if (!ids.length) {
    alert('Select at least one installed mod first.');
    return;
  }

  await updateInstalledModsByIds(ids);
}

async function exportInstalledModList() {
  if (!window.quartzAPI?.exportInstalledModList) {
    alert('Export Installed Mods is not connected. Restart Quartz and try again.');
    return;
  }

  setStatus('Exporting installed mod list...');

  const result = await window.quartzAPI.exportInstalledModList(state.installedMods);

  if (!isOk(result)) {
    alert('Export failed:\n' + getError(result));
    setStatus('Export installed mod list failed.');
    return;
  }

  alert(`Exported ${result.total || state.installedMods.length} installed mod(s).\n\nMarkdown:\n${result.mdPath}\n\nJSON:\n${result.jsonPath}`);
  setStatus(`Installed mod list exported to ${result.exportDir || result.mdPath || 'Desktop'}.`);
}
// ===== Quartz Installed Bulk UI END =====

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

  pruneSelectedInstalledMods();

  const pageData = getInstalledPageData();
  state.installedPage = pageData.page;

  root.innerHTML = `
    <div class="quartz-toolbar">
      <input id="quartz-installed-search" class="quartz-search" placeholder="Search installed mods..." />
      <select id="quartz-installed-sort" class="quartz-installed-sort" title="Sort installed mods">
        <option value="name">A-Z</option>
        <option value="enabled">Enabled First</option>
        <option value="disabled">Disabled First</option>
        <option value="developer">Developer</option>
        <option value="engine">Engine</option>
      </select>
      <span id="quartz-installed-selected-count" class="quartz-selected-count">0 selected</span>
      <span id="quartz-installed-bulk-progress" class="quartz-bulk-progress" hidden></span>
      <button class="secondary-btn small" id="quartz-installed-select-shown-btn">Select Shown</button>
      <button class="secondary-btn small" id="quartz-installed-select-results-btn">Select Results</button>
      <button class="secondary-btn small" id="quartz-installed-clear-selected-btn" disabled>Clear Selected</button>
      <button class="secondary-btn small" id="quartz-installed-enable-selected-btn" disabled>Enable Selected</button>
      <button class="secondary-btn small" id="quartz-installed-disable-selected-btn" disabled>Disable Selected</button>
      <button class="secondary-btn small quartz-danger" id="quartz-installed-uninstall-selected-btn" disabled>Uninstall Selected</button>
      <button class="secondary-btn small" id="quartz-check-updates-btn">Check Updates</button>
      <button class="secondary-btn small" id="quartz-update-selected-btn" disabled>Update Selected</button>
      <button class="primary-btn small" id="quartz-update-all-btn" disabled>Update All</button>
      <button class="secondary-btn small" id="quartz-installed-export-btn">Export List</button>
      <span id="quartz-installed-update-summary" class="muted small">Updates not checked yet.</span>
      <button class="secondary-btn small" id="quartz-open-mods-folder-btn-2">Open Mods Folder</button>
      <button class="secondary-btn small" id="quartz-scan-mods-folder-btn-2">Scan Mods Folder</button>
    </div>
    <div id="quartz-installed-grid" class="quartz-grid"></div>
  `;

  const searchInput = $('#quartz-installed-search');
  const sortSelect = $('#quartz-installed-sort');

  if (searchInput) {
    searchInput.value = state.installedSearch || '';
    searchInput.addEventListener('input', event => {
      state.installedSearch = event.target.value || '';
      state.installedPage = 1;
      renderInstalledMods();

      setTimeout(() => {
        const nextInput = $('#quartz-installed-search');
        if (nextInput) {
          nextInput.focus();
          nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
        }
      }, 0);
    });
  }

  if (sortSelect) {
    sortSelect.value = state.installedSort || 'name';
    sortSelect.addEventListener('change', event => {
      state.installedSort = event.target.value || 'name';
      state.installedPage = 1;
      renderInstalledMods();
    });
  }

  $('#quartz-installed-select-shown-btn')?.addEventListener('click', selectShownInstalledMods);
  $('#quartz-installed-select-results-btn')?.addEventListener('click', selectFilteredInstalledMods);
  $('#quartz-installed-clear-selected-btn')?.addEventListener('click', clearSelectedInstalledMods);
  $('#quartz-installed-enable-selected-btn')?.addEventListener('click', () => runInstalledBulkAction('enable'));
  $('#quartz-installed-disable-selected-btn')?.addEventListener('click', () => runInstalledBulkAction('disable'));
  $('#quartz-installed-uninstall-selected-btn')?.addEventListener('click', () => runInstalledBulkAction('uninstall'));
  $('#quartz-installed-export-btn')?.addEventListener('click', exportInstalledModList);
  $('#quartz-check-updates-btn')?.addEventListener('click', () => checkInstalledModUpdates({ quiet: false }));
  $('#quartz-update-all-btn')?.addEventListener('click', updateAllInstalledMods);
  $('#quartz-update-selected-btn')?.addEventListener('click', updateSelectedInstalledMods);
  $('#quartz-open-mods-folder-btn-2')?.addEventListener('click', openQuartzModsFolder);
  $('#quartz-scan-mods-folder-btn-2')?.addEventListener('click', autoScanQuartzModsFolder);

  const grid = $('#quartz-installed-grid');

  if (!grid) return;

  if (state.installedMods.length === 0) {
    grid.innerHTML = `
      <div class="quartz-empty">
        <h3>No installed mods</h3>
        <p>Install a Quartz package from the Index or drop .quartz/.geode files into the Quartz Mods folder.</p>
      </div>
    `;
  } else if (pageData.mods.length === 0) {
    grid.innerHTML = `
      <div class="quartz-empty">
        <h3>No installed mods found</h3>
        <p>Try a different search or clear the search box.</p>
      </div>
    `;
  } else {
    pageData.mods.forEach(mod => {
      const card = createModCard(mod, 'installed');
      const id = getModId(mod);
      const update = id ? state.installedUpdateMap?.get?.(id) : null;

      if (update && card) {
        card.classList.add('quartz-update-available');
        const badge = document.createElement('div');
        badge.className = 'quartz-update-badge';
        badge.style.cssText = 'margin-top:8px;padding:6px 8px;border-radius:999px;border:1px solid rgba(255,210,80,.45);background:rgba(255,210,80,.12);font-size:12px;';
        badge.textContent = `Update available: ${update.installedVersion} → ${update.latestVersion}`;
        card.appendChild(badge);
      }

      grid.appendChild(card);
    });
  }

  const pager = ensureInstalledPager(root);
  if (pager) {
    $('#quartz-installed-page-label').textContent = `Page ${pageData.page} / ${pageData.totalPages} — ${pageData.total} shown / ${state.installedMods.length} installed`;
    $('#quartz-installed-prev').disabled = pageData.page <= 1;
    $('#quartz-installed-next').disabled = pageData.page >= pageData.totalPages;
  }

  updateInstalledBulkUi();
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

function normalizeQuartzProfiles(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.profiles)) return result.profiles;
  if (Array.isArray(result?.items)) return result.items;
  return [];
}

function getQuartzProfilesSettingsHost() {
  const page = $('#settings');
  if (!page) return null;

  return (
    page.querySelector('.settings-grid') ||
    page.querySelector('.settings-cards') ||
    page.querySelector('.card-grid') ||
    page.querySelector('.page-content') ||
    page
  );
}

function ensureQuartzProfilesCard() {
  if ($('#quartz-profiles-card')) return $('#quartz-profiles-card');

  const host = getQuartzProfilesSettingsHost();
  if (!host) return null;

  const card = document.createElement('section');
  card.id = 'quartz-profiles-card';
  card.className = 'settings-card quartz-card quartz-profiles-card';
  card.innerHTML = `
    <div class="quartz-card-header">
      <div>
        <h3>Profiles / Loadouts</h3>
        <p>Save your currently enabled mods as a loadout, then apply it later to quickly switch setups.</p>
      </div>
    </div>

    <div class="quartz-profile-form" style="display:grid;gap:8px;margin:12px 0;max-width:680px;">
      <label style="display:grid;gap:5px;">
        <span class="muted small">Loadout name</span>
        <input id="quartz-profile-name-input" type="text" placeholder="Main Loadout" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.22);color:inherit;">
      </label>
      <label style="display:grid;gap:5px;">
        <span class="muted small">Description optional</span>
        <input id="quartz-profile-desc-input" type="text" placeholder="Example: daily setup, testing setup, megahack setup..." style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.22);color:inherit;">
      </label>
    </div>

    <div class="quartz-actions quartz-profile-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;">
      <button class="primary-btn small" id="quartz-save-profile-btn">Save Current Loadout</button>
      <button class="secondary-btn small" id="quartz-refresh-profiles-btn">Refresh</button>
      <button class="secondary-btn small" id="quartz-open-profiles-folder-btn">Open Folder</button>
    </div>

    <div id="quartz-profiles-status" class="status-text small muted">Profiles are stored locally on this device.</div>
    <div id="quartz-profiles-list" class="quartz-profiles-list" style="display:grid;gap:10px;margin-top:12px;"></div>
  `;

  host.appendChild(card);


  return card;
}

function setQuartzProfilesStatus(text = '') {
  const el = $('#quartz-profiles-status');
  if (el) el.textContent = text;
}

function renderQuartzProfiles() {
  ensureQuartzProfilesCard();

  const list = $('#quartz-profiles-list');
  if (!list) return;

  const profiles = Array.isArray(state.quartzProfiles) ? state.quartzProfiles : [];

  if (!profiles.length) {
    list.innerHTML = `
      <div class="empty-state" style="padding:12px;border:1px solid rgba(255,255,255,.12);border-radius:12px;">
        <strong>No loadouts saved yet.</strong>
        <p>Enable/disable mods on the Installed Mods page, then come back here and save the current setup.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = '';

  profiles.forEach(profile => {
    const id = String(profile.id || '').trim();
    const name = profile.name || id || 'Quartz Loadout';
    const enabledCount = Number(profile.enabledCount ?? profile.enabledModIds?.length ?? 0);
    const updatedAt = profile.updatedAt || profile.createdAt || '';
    const description = profile.description || 'No description.';
    const updatedLabel = updatedAt ? new Date(updatedAt).toLocaleString() : 'Unknown date';

    const item = document.createElement('div');
    item.className = 'quartz-profile-item';
    item.style.cssText = 'padding:12px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(255,255,255,.035);';
    item.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
        <div style="min-width:220px;flex:1;">
          <h4 style="margin:0 0 4px;">${esc(name)}</h4>
          <p style="margin:0 0 8px;">${esc(description)}</p>
          <div class="muted small">${enabledCount} enabled mod(s) • Updated ${esc(updatedLabel)}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="primary-btn small" data-q-profile-apply="${esc(id)}">Apply</button>
          <button class="danger-btn secondary-btn small" data-q-profile-delete="${esc(id)}">Delete</button>
        </div>
      </div>
    `;

    list.appendChild(item);
  });

}

async function loadQuartzProfiles(quiet = true) {
  ensureQuartzProfilesCard();

  if (!window.quartzAPI?.getQuartzProfiles) {
    setQuartzProfilesStatus('Profiles are not connected yet. Restart Quartz Launcher after updating.');
    return;
  }

  try {
    state.quartzProfilesBusy = true;
    if (!quiet) setQuartzProfilesStatus('Loading profiles...');
    const result = await window.quartzAPI.getQuartzProfiles();
    state.quartzProfiles = normalizeQuartzProfiles(result);
    renderQuartzProfiles();
    setQuartzProfilesStatus(`${state.quartzProfiles.length} saved loadout(s).`);
  } catch (error) {
    setQuartzProfilesStatus(`Could not load profiles: ${error.message || error}`);
  } finally {
    state.quartzProfilesBusy = false;
  }
}

async function saveCurrentQuartzProfile() {
  setQuartzProfilesStatus('Saving current loadout...');

  if (!window.quartzAPI?.saveQuartzProfile) {
    alert('Save Profile is not connected. Restart Quartz Launcher and try again.');
    setQuartzProfilesStatus('Save Profile is not connected. Restart Quartz Launcher and try again.');
    return;
  }

  const nameInput = $('#quartz-profile-name-input');
  const descInput = $('#quartz-profile-desc-input');

  const fallbackName = `Quartz Loadout ${new Date().toLocaleDateString()}`;
  const name = String(nameInput?.value || '').trim() || fallbackName;
  const description = String(descInput?.value || '').trim();

  try {
    const result = await window.quartzAPI.saveQuartzProfile({
      name,
      description
    });

    if (!result?.ok) {
      alert(`Could not save loadout:\n${getError(result)}`);
      setQuartzProfilesStatus('Save failed.');
      return;
    }

    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';

    await loadQuartzProfiles(false);
    setStatus(`Saved loadout "${result.profile?.name || name}" with ${result.enabledCount ?? 0} enabled mod(s).`);
    setQuartzProfilesStatus(`Saved "${result.profile?.name || name}" with ${result.enabledCount ?? 0} enabled mod(s).`);
  } catch (error) {
    alert(`Save Profile crashed:\n${error.message || error}`);
    setQuartzProfilesStatus(`Save crashed: ${error.message || error}`);
  }
}

async function applyQuartzProfile(profileId) {
  if (!profileId) return;

  if (!window.quartzAPI?.applyQuartzProfile) {
    alert('Apply Profile is not connected. Restart Quartz Launcher and try again.');
    return;
  }

  const profile = (state.quartzProfiles || []).find(item => String(item.id) === String(profileId));
  const name = profile?.name || profileId;
  const count = profile?.enabledCount ?? profile?.enabledModIds?.length ?? 0;

  const ok = confirm(
    `Apply "${name}"?\n\nThis will enable ${count} saved mod(s) and disable installed mods that are not in this loadout.`
  );
  if (!ok) return;

  try {
    setQuartzProfilesStatus(`Applying "${name}"...`);
    const result = await window.quartzAPI.applyQuartzProfile(profileId, { keepExtraEnabled: false });

    if (!result?.ok) {
      const failed = Array.isArray(result?.failed) && result.failed.length
        ? '\n\nFailed:\n' + result.failed.map(item => `${item.id}: ${item.error}`).join('\n')
        : '';
      alert(`Profile applied with errors:\n${getError(result)}${failed}`);
    }

    const missing = Number(result?.missingCount || 0);
    const missingText = missing ? ` Missing ${missing} mod(s) that are not installed.` : '';
    setStatus(`Applied "${name}": enabled ${result?.enabledCount ?? 0}, disabled ${result?.disabledCount ?? 0}.${missingText}`);
    setQuartzProfilesStatus(`Applied "${name}".${missingText}`);

    state.selectedInstalledModIds?.clear?.();
    await refreshAll();
    await loadQuartzProfiles(true);
  } catch (error) {
    alert(`Apply Profile crashed:\n${error.message || error}`);
    setQuartzProfilesStatus('Apply crashed.');
  }
}

async function deleteQuartzProfile(profileId) {
  if (!profileId) return;

  if (!window.quartzAPI?.deleteQuartzProfile) {
    alert('Delete Profile is not connected. Restart Quartz Launcher and try again.');
    return;
  }

  const profile = (state.quartzProfiles || []).find(item => String(item.id) === String(profileId));
  const name = profile?.name || profileId;

  if (!confirm(`Delete loadout "${name}"?`)) return;

  try {
    setQuartzProfilesStatus(`Deleting "${name}"...`);
    const result = await window.quartzAPI.deleteQuartzProfile(profileId);

    if (!result?.ok) {
      alert(`Could not delete loadout:\n${getError(result)}`);
      setQuartzProfilesStatus('Delete failed.');
      return;
    }

    await loadQuartzProfiles(false);
    setStatus(`Deleted loadout "${name}".`);
  } catch (error) {
    alert(`Delete Profile crashed:\n${error.message || error}`);
    setQuartzProfilesStatus('Delete crashed.');
  }
}

async function openQuartzProfilesFolder() {
  if (!window.quartzAPI?.openQuartzProfilesFolder) {
    alert('Open Profiles Folder is not connected. Restart Quartz Launcher and try again.');
    return;
  }

  try {
    const result = await window.quartzAPI.openQuartzProfilesFolder();
    if (!result?.ok) {
      alert(`Could not open profiles folder:\n${getError(result)}`);
      return;
    }
    setQuartzProfilesStatus(`Opened profiles folder: ${result.profilesDir || ''}`);
  } catch (error) {
    alert(`Open Profiles Folder crashed:\n${error.message || error}`);
  }
}

function handleQuartzProfilesDelegatedClick(event) {
  const target = event.target?.closest?.(
    '#quartz-save-profile-btn, #quartz-refresh-profiles-btn, #quartz-open-profiles-folder-btn, [data-q-profile-apply], [data-q-profile-delete]'
  );

  if (!target) return;

  event.preventDefault();
  event.stopPropagation();

  if (target.id === 'quartz-save-profile-btn') {
    saveCurrentQuartzProfile();
    return;
  }

  if (target.id === 'quartz-refresh-profiles-btn') {
    loadQuartzProfiles(false);
    return;
  }

  if (target.id === 'quartz-open-profiles-folder-btn') {
    openQuartzProfilesFolder();
    return;
  }

  const applyId = target.getAttribute('data-q-profile-apply');
  if (applyId) {
    applyQuartzProfile(applyId);
    return;
  }

  const deleteId = target.getAttribute('data-q-profile-delete');
  if (deleteId) {
    deleteQuartzProfile(deleteId);
  }
}

function installQuartzProfilesDelegatedClickHandler() {
  if (window.__quartzProfilesDelegatedClickInstalled) return;
  window.__quartzProfilesDelegatedClickInstalled = true;
  document.addEventListener('click', handleQuartzProfilesDelegatedClick);
}

function getQuartzBackupSettingsHost() {
  const page = $('#settings');
  if (!page) return null;

  return (
    page.querySelector('.settings-grid') ||
    page.querySelector('.settings-cards') ||
    page.querySelector('.card-grid') ||
    page.querySelector('.page-content') ||
    page
  );
}

function ensureQuartzBackupCard() {
  if ($('#quartz-backup-card')) return $('#quartz-backup-card');

  const host = getQuartzBackupSettingsHost();
  if (!host) return null;

  const card = document.createElement('section');
  card.id = 'quartz-backup-card';
  card.className = 'settings-card quartz-card quartz-backup-card';
  card.innerHTML = `
    <div class="quartz-card-header">
      <div>
        <h3>Backup / Restore</h3>
        <p>Back up installed packages, enabled/disabled states, profiles/loadouts, and runtime status.</p>
      </div>
    </div>

    <div class="quartz-actions quartz-backup-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;">
      <button class="primary-btn small" id="quartz-create-backup-btn">Create Backup</button>
      <button class="secondary-btn small" id="quartz-restore-backup-btn">Restore Backup</button>
      <button class="secondary-btn small" id="quartz-open-backups-folder-btn">Open Backups Folder</button>
    </div>

    <div id="quartz-backup-status" class="status-text small muted">
      Backups are saved to a QuartzLauncherBackups folder on your Desktop.
    </div>
  `;

  const profilesCard = $('#quartz-profiles-card');
  if (profilesCard && profilesCard.parentElement === host) {
    host.insertBefore(card, profilesCard);
  } else {
    host.appendChild(card);
  }

  return card;
}

function setQuartzBackupStatus(text = '') {
  const el = $('#quartz-backup-status');
  if (el) el.textContent = text;
}

async function createQuartzBackup() {
  ensureQuartzBackupCard();

  if (!window.quartzAPI?.createQuartzBackup) {
    alert('Create Backup is not connected. Restart Quartz Launcher and try again.');
    setQuartzBackupStatus('Create Backup is not connected. Restart Quartz Launcher and try again.');
    return;
  }

  try {
    setQuartzBackupStatus('Creating backup...');
    const result = await window.quartzAPI.createQuartzBackup();

    if (!result?.ok) {
      alert(`Could not create backup:\n${getError(result)}`);
      setQuartzBackupStatus('Backup failed.');
      return;
    }

    const msg = `Backup created: ${result.copiedPackages ?? 0} package(s), ${result.enabledCount ?? 0} enabled mod(s), ${result.copiedProfiles ?? 0} profile(s).`;
    setQuartzBackupStatus(`${msg} Folder: ${result.backupDir || ''}`);
    setStatus(msg);
    alert(`${msg}\n\n${result.backupDir || ''}`);
  } catch (error) {
    alert(`Create Backup crashed:\n${error.message || error}`);
    setQuartzBackupStatus(`Backup crashed: ${error.message || error}`);
  }
}

async function restoreQuartzBackup() {
  ensureQuartzBackupCard();

  if (!window.quartzAPI?.restoreQuartzBackup) {
    alert('Restore Backup is not connected. Restart Quartz Launcher and try again.');
    setQuartzBackupStatus('Restore Backup is not connected. Restart Quartz Launcher and try again.');
    return;
  }

  const ok = confirm(
    'Restore a Quartz backup?\n\nThis will copy backed-up packages and profiles back into Quartz, then reapply the backed-up enabled/disabled states. It will not delete unrelated current mods.'
  );
  if (!ok) return;

  try {
    setQuartzBackupStatus('Choose a backup folder...');
    const result = await window.quartzAPI.restoreQuartzBackup();

    if (result?.canceled) {
      setQuartzBackupStatus('Restore canceled.');
      return;
    }

    if (!result?.ok) {
      const failed = Array.isArray(result?.failed) && result.failed.length
        ? '\n\nFailed:\n' + result.failed.map(item => `${item.step || 'step'}${item.id ? ` ${item.id}` : ''}: ${item.error}`).join('\n')
        : '';
      alert(`Restore finished with errors:\n${getError(result)}${failed}`);
    }

    const msg = `Restore finished: ${result?.restoredPackages ?? 0} package(s), ${result?.restoredProfiles ?? 0} profile(s), enabled ${result?.enabledCount ?? 0}, disabled ${result?.disabledCount ?? 0}.`;
    setQuartzBackupStatus(msg);
    setStatus(msg);

    state.selectedInstalledModIds?.clear?.();
    await refreshAll();
    if (typeof loadQuartzProfiles === 'function') await loadQuartzProfiles(true);
  } catch (error) {
    alert(`Restore Backup crashed:\n${error.message || error}`);
    setQuartzBackupStatus(`Restore crashed: ${error.message || error}`);
  }
}

async function openQuartzBackupsFolder() {
  ensureQuartzBackupCard();

  if (!window.quartzAPI?.openQuartzBackupsFolder) {
    alert('Open Backups Folder is not connected. Restart Quartz Launcher and try again.');
    return;
  }

  try {
    const result = await window.quartzAPI.openQuartzBackupsFolder();
    if (!result?.ok) {
      alert(`Could not open backups folder:\n${getError(result)}`);
      return;
    }
    setQuartzBackupStatus(`Opened backups folder: ${result.backupsDir || ''}`);
  } catch (error) {
    alert(`Open Backups Folder crashed:\n${error.message || error}`);
  }
}

function handleQuartzBackupDelegatedClick(event) {
  const target = event.target?.closest?.(
    '#quartz-create-backup-btn, #quartz-restore-backup-btn, #quartz-open-backups-folder-btn'
  );

  if (!target) return;

  event.preventDefault();
  event.stopPropagation();

  if (target.id === 'quartz-create-backup-btn') {
    createQuartzBackup();
    return;
  }

  if (target.id === 'quartz-restore-backup-btn') {
    restoreQuartzBackup();
    return;
  }

  if (target.id === 'quartz-open-backups-folder-btn') {
    openQuartzBackupsFolder();
  }
}

function installQuartzBackupDelegatedClickHandler() {
  if (window.__quartzBackupDelegatedClickInstalled) return;
  window.__quartzBackupDelegatedClickInstalled = true;
  document.addEventListener('click', handleQuartzBackupDelegatedClick);
}

function getQuartzSafetySettingsHost() {
  const page = $('#settings');
  if (!page) return null;

  return (
    page.querySelector('.settings-grid') ||
    page.querySelector('.settings-cards') ||
    page.querySelector('.card-grid') ||
    page.querySelector('.page-content') ||
    page
  );
}

function ensureQuartzSafetyCard() {
  if ($('#quartz-safety-card')) return $('#quartz-safety-card');

  const host = getQuartzSafetySettingsHost();
  if (!host) return null;

  const card = document.createElement('section');
  card.id = 'quartz-safety-card';
  card.className = 'settings-card quartz-card quartz-safety-card';
  card.innerHTML = `
    <div class="quartz-card-header">
      <div>
        <h3>Pre-launch Safety Check</h3>
        <p>Check installed packages, enabled mods, validation, and runtime sync before launching Geometry Dash.</p>
      </div>
    </div>

    <div class="quartz-actions quartz-safety-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;">
      <button class="primary-btn small" id="quartz-run-safety-check-btn">Run Safety Check</button>
    </div>

    <div id="quartz-safety-status" class="status-text small muted">Safety check has not been run yet.</div>
    <div id="quartz-safety-results" style="display:grid;gap:8px;margin-top:12px;"></div>
  `;

  const backupCard = $('#quartz-backup-card');
  const profilesCard = $('#quartz-profiles-card');

  if (backupCard && backupCard.parentElement === host) {
    host.insertBefore(card, backupCard);
  } else if (profilesCard && profilesCard.parentElement === host) {
    host.insertBefore(card, profilesCard);
  } else {
    host.appendChild(card);
  }

  return card;
}

function setQuartzSafetyStatus(text = '') {
  const el = $('#quartz-safety-status');
  if (el) el.textContent = text;
}

function quartzSafetyResultColor(risk = '') {
  if (risk === 'pass') return 'rgba(90,255,150,.14)';
  if (risk === 'warn') return 'rgba(255,210,80,.14)';
  if (risk === 'fail') return 'rgba(255,90,90,.14)';
  return 'rgba(255,255,255,.05)';
}

function quartzSafetyResultBorder(risk = '') {
  if (risk === 'pass') return 'rgba(90,255,150,.35)';
  if (risk === 'warn') return 'rgba(255,210,80,.45)';
  if (risk === 'fail') return 'rgba(255,90,90,.45)';
  return 'rgba(255,255,255,.12)';
}

function renderQuartzSafetyResults(result = {}) {
  ensureQuartzSafetyCard();

  const root = $('#quartz-safety-results');
  if (!root) return;

  const risk = result.risk || (result.ok ? 'pass' : 'fail');
  const title = risk === 'pass'
    ? 'Passed'
    : risk === 'warn'
      ? 'Passed with warnings'
      : 'Needs attention';

  const rows = [];

  rows.push(`
    <div style="padding:10px 12px;border-radius:12px;border:1px solid ${quartzSafetyResultBorder(risk)};background:${quartzSafetyResultColor(risk)};">
      <strong>${esc(title)}</strong>
      <div class="muted small" style="margin-top:4px;">
        ${result.installedCount ?? 0} installed • ${result.enabledCount ?? 0} enabled • ${result.disabledCount ?? 0} disabled
      </div>
    </div>
  `);

  const groups = [
    ['Issues', result.issues || [], 'fail'],
    ['Warnings', result.warnings || [], 'warn'],
    ['Passed checks', result.passed || [], 'pass']
  ];

  for (const [label, items, groupRisk] of groups) {
    if (!Array.isArray(items) || !items.length) continue;

    const list = items.slice(0, 12).map(item => {
      const details = Array.isArray(item.details) && item.details.length
        ? `<ul style="margin:6px 0 0 18px;">${item.details.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
        : '';

      const ids = Array.isArray(item.ids) && item.ids.length
        ? `<div class="muted small" style="margin-top:4px;">${esc(item.ids.join(', '))}</div>`
        : '';

      return `
        <li style="margin:6px 0;">
          <strong>${esc(item.area || groupRisk)}</strong>${item.id ? ` / ${esc(item.id)}` : ''}: ${esc(item.message || item)}
          ${details}
          ${ids}
        </li>
      `;
    }).join('');

    rows.push(`
      <div style="padding:10px 12px;border-radius:12px;border:1px solid ${quartzSafetyResultBorder(groupRisk)};background:${quartzSafetyResultColor(groupRisk)};">
        <strong>${esc(label)} (${items.length})</strong>
        <ul style="margin:8px 0 0 18px;padding:0;">${list}</ul>
      </div>
    `);
  }

  root.innerHTML = rows.join('');
}

async function runQuartzSafetyCheck() {
  ensureQuartzSafetyCard();

  if (!window.quartzAPI?.runQuartzPrelaunchSafetyCheck) {
    alert('Pre-launch Safety Check is not connected. Restart Quartz Launcher and try again.');
    setQuartzSafetyStatus('Pre-launch Safety Check is not connected. Restart Quartz Launcher and try again.');
    return;
  }

  try {
    setQuartzSafetyStatus('Running safety check and syncing runtime...');
    const result = await window.quartzAPI.runQuartzPrelaunchSafetyCheck({ syncRuntime: true });

    renderQuartzSafetyResults(result);

    const risk = result.risk || (result.ok ? 'pass' : 'fail');
    const msg = risk === 'pass'
      ? `Safety check passed: ${result.enabledCount ?? 0} enabled mod(s) ready.`
      : risk === 'warn'
        ? `Safety check passed with ${result.warningCount ?? 0} warning(s).`
        : `Safety check found ${result.issueCount ?? 0} issue(s).`;

    setQuartzSafetyStatus(msg);
    setStatus(msg);
  } catch (error) {
    alert(`Safety Check crashed:\n${error.message || error}`);
    setQuartzSafetyStatus(`Safety Check crashed: ${error.message || error}`);
  }
}

function handleQuartzSafetyDelegatedClick(event) {
  const target = event.target?.closest?.('#quartz-run-safety-check-btn');
  if (!target) return;

  event.preventDefault();
  event.stopPropagation();

  runQuartzSafetyCheck();
}

function installQuartzSafetyDelegatedClickHandler() {
  if (window.__quartzSafetyDelegatedClickInstalled) return;
  window.__quartzSafetyDelegatedClickInstalled = true;
  document.addEventListener('click', handleQuartzSafetyDelegatedClick);
}

async function updateSettings() {
  ensureRuntimeSettingsCard();
  ensureQuartzSafetyCard();
  ensureQuartzSafetyCard();
  ensureQuartzBackupCard();
  ensureQuartzBackupCard();
  ensureQuartzBackupCard();
  ensureQuartzProfilesCard();
  ensureQuartzProfilesCard();
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
  installQuartzSafetyDelegatedClickHandler();
  installQuartzBackupDelegatedClickHandler();
  installQuartzProfilesDelegatedClickHandler();
  addStyles();
  bindButtons();
  ensureIndexTools();
  ensureRuntimeSettingsCard();

  const activePage = $('.page.active-page')?.id || 'home';
  showPage(activePage);

  setStatus('Quartz Launcher ready.');
});
