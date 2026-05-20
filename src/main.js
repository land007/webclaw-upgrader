/* webclaw-upgrader 前端入口
 * 阶段 1：骨架版——所有命令接好，但后端返回空数据。
 * 阶段 3-4 后端实现后，本文件无需大改即可工作。
 */

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// ─── DOM 引用 ───────────────────────────────────────
const $ = (sel) => document.querySelector(sel);

const btnRefresh = $('#btn-refresh');
const btnTheme = $('#btn-theme');
const tabs = document.querySelectorAll('.tab-btn');
const swPane = $('#software-pane');
const svPane = $('#supervisor-pane');
const logOutput = $('#log-output');
const logPanel = $('#log-panel');
const btnLogToggle = $('#btn-log-toggle');
const btnLogClear = $('#btn-log-clear');
const currentDir = $('#current-dir');

const confirmModal = $('#confirm-modal');
const confirmTitle = $('#confirm-title');
const confirmCommand = $('#confirm-command');
const snapshotChecked = $('#snapshot-checked');
const btnConfirmGo = $('#btn-confirm-go');
const btnConfirmCancel = $('#btn-confirm-cancel');
const btnConfirmClose = $('#btn-confirm-close');

const drawer = $('#upgrade-drawer');
const drawerTitle = $('#upgrade-drawer-title');
const drawerStage = $('#upgrade-drawer-stage');
const drawerOutput = $('#upgrade-drawer-output');
const drawerFill = $('#upgrade-progress-fill');
const btnDrawerClose = $('#btn-drawer-close');
const btnCancelUpgrade = $('#btn-cancel-upgrade');

// ─── 状态 ───────────────────────────────────────────
const state = {
  manifest: [],
  cards: new Map(),    // id -> SoftwareCard
  processes: [],
  activeTab: 'software',
  activeUpgrade: null, // 正在升级的 id
};

// ─── Theme ──────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'light') {
    document.documentElement.setAttribute('data-theme', saved);
  }
  updateThemeIcon();
}

function updateThemeIcon() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    || (!document.documentElement.hasAttribute('data-theme')
        && window.matchMedia('(prefers-color-scheme: dark)').matches);
  btnTheme.textContent = isDark ? '☀' : '☾';
}

btnTheme.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon();
});

// ─── Logging ────────────────────────────────────────
function appendLog(text, type = 'info') {
  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  line.textContent = `[${ts}] ${text}`;
  logOutput.appendChild(line);
  logOutput.scrollTop = logOutput.scrollHeight;
  if (logPanel.classList.contains('collapsed')) {
    logPanel.classList.remove('collapsed');
    btnLogToggle.textContent = '收起';
  }
}

btnLogToggle.addEventListener('click', () => {
  logPanel.classList.toggle('collapsed');
  btnLogToggle.textContent = logPanel.classList.contains('collapsed') ? '展开' : '收起';
});
btnLogClear.addEventListener('click', () => { logOutput.innerHTML = ''; });

// ─── Tabs ───────────────────────────────────────────
tabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    state.activeTab = tab;
    tabs.forEach((b) => b.classList.toggle('tab-active', b === btn));
    swPane.classList.toggle('hidden', tab !== 'software');
    svPane.classList.toggle('hidden', tab !== 'supervisor');
  });
});

// ─── Refresh ────────────────────────────────────────
btnRefresh.addEventListener('click', refreshAll);

async function refreshAll() {
  btnRefresh.disabled = true;
  btnRefresh.textContent = '扫描中...';
  try {
    await Promise.all([refreshSoftware(), refreshSupervisor()]);
  } catch (e) {
    appendLog(`刷新失败: ${e}`, 'error');
  } finally {
    btnRefresh.disabled = false;
    btnRefresh.textContent = '扫描 & 检查更新';
  }
}

async function refreshSoftware() {
  appendLog('开始扫描软件清单...', 'info');
  let manifest;
  try {
    manifest = await invoke('load_manifest');
  } catch (e) {
    appendLog(`load_manifest 失败: ${e}`, 'error');
    return;
  }
  state.manifest = manifest;
  currentDir.textContent = `manifest: ${manifest.length} 项`;
  if (manifest.length === 0) {
    swPane.innerHTML = '<div id="empty-state">manifest 为空（阶段 2 将填充 10 条软件）</div>';
    return;
  }
  // 并行 detect + check_latest（阶段 3 实现）
  const [detected, latest] = await Promise.all([
    invoke('detect_all').catch((e) => { appendLog(`detect_all: ${e}`, 'error'); return []; }),
    invoke('check_latest_all').catch((e) => { appendLog(`check_latest_all: ${e}`, 'error'); return []; }),
  ]);
  // 合并：先放 detected 的，再用 latest 覆盖 latest_version
  const merged = new Map();
  detected.forEach((c) => merged.set(c.id, { ...c }));
  latest.forEach((c) => {
    const cur = merged.get(c.id) || { ...c };
    if (c.latest_version) cur.latest_version = c.latest_version;
    if (c.state) cur.state = c.state;
    merged.set(c.id, cur);
  });
  state.cards = merged;
  renderSoftwarePane();
  // 锁定软件提示（manifest 中 locked 字段）
  try {
    const locked = await invoke('list_locked');
    renderLockedSection(locked || []);
  } catch (e) {
    appendLog(`list_locked: ${e}`, 'info');
  }
  appendLog(`扫描完成：${merged.size} 项`, 'ok');
}

function renderLockedSection(locked) {
  // 在 software pane 末尾追加"锁定软件"区段
  if (!locked.length) return;
  const section = document.createElement('div');
  section.style.cssText = 'grid-column:1/-1;margin-top:18px;padding-top:14px;border-top:1px solid var(--border);';
  section.innerHTML = `
    <div style="font-size:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;">
      🔒 锁定版本（需修改 Dockerfile.base 后重建镜像）
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:10px;">
    ${locked.map((l) => `
      <div class="sw-card" style="opacity:.75">
        <div class="sw-card-header">
          <span class="sw-name">${escapeHtml(l.name)}</span>
          <span class="state-badge state-locked">已锁版本</span>
        </div>
        <div class="sw-meta">${escapeHtml(l.reason)}</div>
        ${l.dockerfile_line ? `<div class="command-preview" style="margin-bottom:6px">${escapeHtml(l.dockerfile_line)}</div>` : ''}
        ${l.dockerfile_line ? `<button class="btn-ghost btn-sm" data-line="${escapeHtml(l.dockerfile_line)}">📋 复制</button>` : ''}
      </div>
    `).join('')}
    </div>
  `;
  swPane.appendChild(section);
  section.querySelectorAll('[data-line]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.line);
      appendLog('已复制到剪贴板', 'ok');
    });
  });
}

async function refreshSupervisor() {
  let procs;
  try {
    procs = await invoke('supervisor_status');
  } catch (e) {
    appendLog(`supervisor_status 失败: ${e}`, 'error');
    return;
  }
  state.processes = procs;
  renderSupervisorPane();
}

// ─── Render: Software ───────────────────────────────
function renderSoftwarePane() {
  swPane.innerHTML = '';
  if (state.cards.size === 0) {
    swPane.innerHTML = '<div id="empty-state">manifest 为空</div>';
    return;
  }
  state.cards.forEach((card) => swPane.appendChild(buildSoftwareCard(card)));
}

function buildSoftwareCard(card) {
  const el = document.createElement('div');
  el.className = 'sw-card';
  el.dataset.id = card.id;

  const stateBadge = `<span class="state-badge state-${(card.state || 'unknown').replace(/_/g, '-')}">${stateLabel(card.state)}</span>`;
  const cur = card.current_version || '<span style="color:var(--text-secondary)">未检测</span>';
  const latest = card.latest_version || '<span style="color:var(--text-secondary)">?</span>';

  el.innerHTML = `
    <div class="sw-card-header">
      <span class="sw-name">${escapeHtml(card.name)}</span>
      <span class="sw-category">${escapeHtml(card.category || '')}</span>
      ${stateBadge}
    </div>
    <div class="sw-versions">
      <span class="from">${cur}</span><span class="arrow">→</span><span class="to">${latest}</span>
    </div>
    <div class="sw-meta">风险等级: ${escapeHtml(card.risk || 'unknown')}</div>
    <div class="sw-actions">
      <button class="btn-primary btn-sm" data-act="upgrade" ${card.state === 'upgradable' ? '' : 'disabled'}>升级</button>
      <button class="btn-ghost btn-sm" data-act="redetect">重新检测</button>
    </div>
  `;
  if (card.error) {
    const err = document.createElement('div');
    err.className = 'card-error';
    err.textContent = card.error;
    el.appendChild(err);
  }
  el.querySelector('[data-act="upgrade"]').addEventListener('click', () => openConfirmModal(card));
  el.querySelector('[data-act="redetect"]').addEventListener('click', () => redetectOne(card.id));
  return el;
}

function stateLabel(s) {
  return ({
    up_to_date: '已最新',
    upgradable: '可升级',
    locked: '已锁版本',
    error: '错误',
    in_progress: '升级中',
    unknown: '-',
  })[s] || s || '-';
}

async function redetectOne(id) {
  appendLog(`重新检测 ${id}（阶段 3 实现单项检测）`, 'info');
  await refreshSoftware();
}

// ─── Render: Supervisor ─────────────────────────────
function renderSupervisorPane() {
  svPane.innerHTML = '';
  if (state.processes.length === 0) {
    svPane.innerHTML = '<div id="empty-state-sv">无进程数据</div>';
    return;
  }
  state.processes.forEach((p) => svPane.appendChild(buildProcessCard(p)));
}

function buildProcessCard(p) {
  const el = document.createElement('div');
  el.className = 'sw-card';
  el.dataset.name = p.name;
  const cls = `proc-${(p.state || 'unknown').toLowerCase()}`;
  const uptime = p.uptime_secs ? formatUptime(p.uptime_secs) : '-';
  el.innerHTML = `
    <div class="sw-card-header">
      <span class="sw-name">${escapeHtml(p.name)}</span>
      <span class="state-badge ${cls}">${escapeHtml(p.state)}</span>
    </div>
    <div class="sw-meta">PID: ${p.pid ?? '-'} · 运行: ${uptime}</div>
    <div class="sw-meta">${escapeHtml(p.description || '')}</div>
    <div class="sw-actions">
      <button class="btn-action btn-sm" data-act="restart">↻ 重启</button>
      <button class="btn-ghost btn-sm" data-act="log">📜 日志</button>
    </div>
  `;
  el.querySelector('[data-act="restart"]').addEventListener('click', () => restartProc(p.name, el));
  el.querySelector('[data-act="log"]').addEventListener('click', () => showProcLog(p.name));
  return el;
}

function formatUptime(s) {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

async function restartProc(name, cardEl) {
  cardEl.classList.add('loading');
  try {
    await invoke('supervisor_restart', { name });
    appendLog(`重启 ${name} 成功`, 'ok');
    await refreshSupervisor();
  } catch (e) {
    appendLog(`重启 ${name} 失败: ${e}`, 'error');
  } finally {
    cardEl.classList.remove('loading');
  }
}

async function showProcLog(name) {
  try {
    const text = await invoke('supervisor_tail_log', { name, lines: 200 });
    appendLog(`────── ${name} 最近 200 行 ──────`, 'info');
    text.split('\n').forEach((line) => { if (line) appendLog(line, 'info'); });
  } catch (e) {
    appendLog(`读取日志失败: ${e}`, 'error');
  }
}

// ─── Confirm Modal ──────────────────────────────────
let pendingUpgrade = null;

function openConfirmModal(card) {
  pendingUpgrade = card;
  confirmTitle.textContent = `升级 ${card.name}`;
  confirmCommand.textContent = buildUpgradeCommandPreview(card);
  snapshotChecked.checked = false;
  btnConfirmGo.disabled = true;
  confirmModal.classList.remove('hidden');
}

function buildUpgradeCommandPreview(card) {
  return `# 完整命令将在阶段 3 由 Rust 端构造\n# 升级 ${card.id} (${card.current_version || '?'} → ${card.latest_version || '?'})`;
}

snapshotChecked.addEventListener('change', () => {
  btnConfirmGo.disabled = !snapshotChecked.checked;
});

btnConfirmCancel.addEventListener('click', closeConfirmModal);
btnConfirmClose.addEventListener('click', closeConfirmModal);
$('#confirm-backdrop').addEventListener('click', closeConfirmModal);
btnConfirmGo.addEventListener('click', startUpgrade);

function closeConfirmModal() {
  confirmModal.classList.add('hidden');
  pendingUpgrade = null;
}

async function startUpgrade() {
  if (!pendingUpgrade) return;
  const card = pendingUpgrade;
  closeConfirmModal();
  openDrawer(card);
  state.activeUpgrade = card.id;
  try {
    await invoke('upgrade_software', { id: card.id, snapshotConfirmed: true });
    setDrawerStage('DONE');
    drawerFill.style.right = '0%';
    appendLog(`${card.name} 升级完成`, 'ok');
    state.activeUpgrade = null;
    await refreshSoftware();
  } catch (e) {
    setDrawerStage('ERROR');
    appendOutLine(String(e), 'out-stderr');
    appendLog(`${card.name} 升级失败: ${e}`, 'error');
    state.activeUpgrade = null;
  }
}

// ─── Drawer ─────────────────────────────────────────
function openDrawer(card) {
  drawerTitle.textContent = `升级 ${card.name}`;
  drawerOutput.innerHTML = '';
  drawerFill.style.right = '100%';
  setDrawerStage('PENDING');
  drawer.classList.add('open');
}

function setDrawerStage(stage) {
  drawerStage.textContent = stage;
}

function appendOutLine(text, cls = 'out-line') {
  const line = document.createElement('div');
  line.className = `out-line ${cls}`;
  line.textContent = text;
  drawerOutput.appendChild(line);
  drawerOutput.scrollTop = drawerOutput.scrollHeight;
}

btnDrawerClose.addEventListener('click', () => {
  drawer.classList.remove('open');
});

btnCancelUpgrade.addEventListener('click', async () => {
  if (!state.activeUpgrade) return;
  try {
    await invoke('cancel_upgrade', { id: state.activeUpgrade });
    appendLog(`已请求取消 ${state.activeUpgrade}`, 'info');
  } catch (e) {
    appendLog(`取消失败: ${e}`, 'error');
  }
});

// ─── 进度事件订阅 ───────────────────────────────────
listen('upgrade-progress', (event) => {
  const p = event.payload;
  if (!p) return;
  if (p.stage) setDrawerStage(p.stage.toUpperCase());
  if (typeof p.percent === 'number') {
    drawerFill.style.right = `${Math.max(0, 100 - p.percent)}%`;
  }
  if (p.line) appendOutLine(p.line);
}).catch((e) => appendLog(`事件订阅失败: ${e}`, 'error'));

// ─── Boot ───────────────────────────────────────────
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

(async () => {
  initTheme();
  appendLog('webclaw-upgrader v0.1.0 启动', 'info');
  await refreshAll();
})();
