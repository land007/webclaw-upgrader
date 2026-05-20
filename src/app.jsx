// app.jsx — WebClaw 升级中心 主应用

const TWEAK_DEFAULTS = {
  accent: '#D4623A',
  density: 'regular',
  dark: false,
  showRisk: true,
};

const tauriInvoke = (...args) => window.__TAURI__?.core?.invoke(...args);
const tauriListen = (...args) => window.__TAURI__?.event?.listen(...args);

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [items, setItems] = React.useState([]);
  const [processes, setProcesses] = React.useState([]);
  const [tab, setTab] = React.useState('software');
  const [filter, setFilter] = React.useState('all');
  const [q, setQ] = React.useState('');
  const [sort, setSort] = React.useState('priority');
  const [selected, setSelected] = React.useState(new Set());
  const [modal, setModal] = React.useState(null);
  const [logModal, setLogModal] = React.useState(null);
  const [upgradeState, setUpgradeState] = React.useState(null);
  const [log, setLog] = React.useState(window.INITIAL_LOG);
  const [logOpen, setLogOpen] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const [supervisorLoading, setSupervisorLoading] = React.useState(false);
  const [lastScan, setLastScan] = React.useState('');

  const addLog = React.useCallback((msg, tone = 'dim') => {
    const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
    setLog(L => [...L, { ts, msg, tone }]);
  }, []);

  const counts = React.useMemo(() => {
    const upgradable = items.filter(i => i.status === 'upgradable').length;
    const latest = items.filter(i => i.status === 'latest').length;
    const unknown = items.filter(i => i.status === 'unknown' || i.status === 'error').length;
    const locked = window.LOCKED_ITEMS.length;
    const highrisk = items.filter(i => i.risk === 'high').length;
    return { total: items.length, upgradable, latest, unknown, locked, highrisk };
  }, [items]);

  const visible = React.useMemo(() => {
    let v = items.slice();
    if (filter === 'upgradable') v = v.filter(i => i.status === 'upgradable');
    else if (filter === 'latest') v = v.filter(i => i.status === 'latest');
    else if (filter === 'unknown') v = v.filter(i => i.status === 'unknown' || i.status === 'error');
    else if (filter === 'locked') v = [];
    else if (filter === 'highrisk') v = v.filter(i => i.risk === 'high');

    if (q.trim()) {
      const k = q.trim().toLowerCase();
      v = v.filter(i =>
        i.name.toLowerCase().includes(k) ||
        i.type.toLowerCase().includes(k) ||
        (i.current || '').toLowerCase().includes(k) ||
        (i.latest || '').toLowerCase().includes(k) ||
        i.repo.toLowerCase().includes(k));
    }

    const rank = { upgradable: 0, unknown: 1, error: 1, latest: 2, locked: 3 };
    const riskRank = { high: 0, medium: 1, low: 2 };
    if (sort === 'priority') v.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
    if (sort === 'risk') v.sort((a, b) => riskRank[a.risk] - riskRank[b.risk] || a.name.localeCompare(b.name));
    if (sort === 'name') v.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'type') v.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    return v;
  }, [items, filter, q, sort]);

  const onScan = React.useCallback(async () => {
    if (!tauriInvoke) {
      addLog('Tauri IPC 不可用：请在 tauri dev/build 中运行', 'err');
      return;
    }
    setScanning(true);
    addLog('开始扫描软件清单...', 'dim');
    try {
      const [detected, latest] = await Promise.all([
        tauriInvoke('detect_all'),
        tauriInvoke('check_latest_all'),
      ]);
      const latestMap = Object.fromEntries(latest.map(card => [card.id, card]));
      const merged = detected.map(card => mergeCard(card, latestMap[card.id]));
      setItems(merged);
      const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
      setLastScan(ts);
      addLog(`扫描完成：${merged.length} 项，其中 ${merged.filter(i => i.status === 'upgradable').length} 项可升级`, 'ok');
    } catch (e) {
      addLog(`扫描失败：${stringifyError(e)}`, 'err');
    } finally {
      setScanning(false);
    }
  }, [addLog]);

  const loadSupervisor = React.useCallback(async () => {
    if (!tauriInvoke) {
      addLog('Tauri IPC 不可用：无法读取 supervisor 状态', 'err');
      return;
    }
    setSupervisorLoading(true);
    try {
      const procs = await tauriInvoke('supervisor_status');
      setProcesses(procs);
      addLog(`进程状态已刷新：${procs.length} 项`, 'ok');
    } catch (e) {
      addLog(`读取进程状态失败：${stringifyError(e)}`, 'err');
    } finally {
      setSupervisorLoading(false);
    }
  }, [addLog]);

  const onTab = (next) => {
    setTab(next);
    if (next === 'supervisor') loadSupervisor();
  };

  const onUpgradeOne = (item) => {
    setUpgradeState(null);
    setModal({ item });
  };

  const onRecheck = async (id) => {
    addLog(`重新检测 ${id}...`, 'dim');
    await onScan();
  };

  const onBatchUpgrade = () => {
    if (!selected.size) return;
    const batch = items.filter(i => selected.has(i.id));
    setUpgradeState(null);
    setModal({ batch });
  };

  const onBatchRecheck = async () => {
    addLog(`批量重新检测 ${selected.size} 项...`, 'dim');
    await onScan();
  };

  const onSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const onConfirmUpgrade = async (targets, snapshotConfirmed) => {
    if (!tauriInvoke || !tauriListen) {
      addLog('Tauri IPC 不可用：无法执行升级', 'err');
      return;
    }
    setUpgradeState({ phase: 'running', percent: 0, lines: [], stage: 'CHECKING' });
    const unlisten = await tauriListen('upgrade-progress', ev => {
      const { stage, percent, line } = ev.payload || {};
      setUpgradeState(prev => ({
        ...prev,
        stage: String(stage || prev?.stage || '').toUpperCase(),
        percent: percent == null ? (prev?.percent || 0) : percent,
        lines: line ? [...(prev?.lines || []), line] : (prev?.lines || []),
        phase: ['done', 'error'].includes(String(stage).toLowerCase()) ? 'done' : 'running',
      }));
    });
    try {
      for (const target of targets) {
        addLog(`开始升级 ${target.name}...`, 'up');
        await tauriInvoke('upgrade_software', { id: target.id, snapshotConfirmed });
        addLog(`${target.name} 升级完成`, 'ok');
      }
      setItems(prev => prev.map(i => (
        targets.some(tgt => tgt.id === i.id)
          ? { ...i, current: i.latest ?? i.current, status: i.latest ? 'latest' : i.status }
          : i
      )));
      setSelected(new Set());
      setUpgradeState(prev => ({ ...prev, phase: 'done', stage: 'DONE', percent: 100 }));
    } catch (e) {
      addLog(`升级失败：${stringifyError(e)}`, 'err');
      setUpgradeState(prev => ({
        ...prev,
        phase: 'done',
        stage: 'ERROR',
        lines: [...(prev?.lines || []), stringifyError(e)],
      }));
    } finally {
      unlisten();
    }
  };

  const restartProcess = async (name) => {
    addLog(`重启进程 ${name}...`, 'dim');
    try {
      await tauriInvoke('supervisor_restart', { name });
      addLog(`${name} 已重启`, 'ok');
      await loadSupervisor();
    } catch (e) {
      addLog(`重启 ${name} 失败：${stringifyError(e)}`, 'err');
    }
  };

  const viewLog = async (name) => {
    try {
      const content = await tauriInvoke('supervisor_tail_log', { name, lines: 200 });
      setLogModal({ name, content });
    } catch (e) {
      addLog(`读取 ${name} 日志失败：${stringifyError(e)}`, 'err');
    }
  };

  const onCopySnippet = (snippet) => {
    if (navigator.clipboard) navigator.clipboard.writeText(snippet);
    addLog(`已复制片段：${snippet}`, 'dim');
  };

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', t.dark ? 'dark' : 'light');
    document.documentElement.style.setProperty('--accent', t.accent);
    document.documentElement.style.setProperty('--accent-2', shade(t.accent, -18));
    document.documentElement.style.setProperty('--accent-tint', tint(t.accent, t.dark));
  }, [t.dark, t.accent]);

  React.useEffect(() => {
    onScan();
  }, [onScan]);

  const showLocked = filter === 'all' || filter === 'locked';

  return (
    <div className="app">
      <Header counts={counts}
              lastScan={lastScan}
              scanning={scanning}
              onScan={onScan}
              dark={t.dark}
              onToggleDark={() => setTweak('dark', !t.dark)}
              onOpenTweaks={() => window.postMessage({ type: '__activate_edit_mode' }, '*')}/>
      <Tabs tab={tab} onTab={onTab}/>

      {tab === 'software' && (
        <>
          <Stats counts={counts} active={filter} onPick={(k) => setFilter(k === filter ? 'all' : k)}/>
          <Toolbar filter={filter} onFilter={setFilter} counts={counts} q={q} onQ={setQ} sort={sort} onSort={setSort}/>
          {selected.size > 0 && (
            <BatchBar count={selected.size}
                      onClear={() => setSelected(new Set())}
                      onUpgrade={onBatchUpgrade}
                      onRecheck={onBatchRecheck}/>
          )}
          <div className={`grid density-${t.density}`}>
            {visible.map(i => (
              <Card key={i.id}
                    item={i}
                    selected={selected.has(i.id)}
                    onSelect={onSelect}
                    onUpgrade={onUpgradeOne}
                    onRecheck={onRecheck}
                    dense={t.density === 'compact'}/>
            ))}
            {visible.length === 0 && filter !== 'locked' && (
              <div className="empty-panel">没有匹配的软件项，试试调整筛选或搜索词</div>
            )}
          </div>
          {showLocked && (
            <>
              <div className="section-head">
                <Icon name="lock" size={14}/>
                <h2>锁定版本</h2>
                <span className="hint">需修改 Dockerfile 后重建镜像</span>
                <hr className="section-line"/>
              </div>
              <div className={`grid density-${t.density}`}>
                {window.LOCKED_ITEMS.map(l => <LockedCard key={l.id} item={l} onCopy={onCopySnippet}/>)}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'supervisor' && (
        <SupervisorTab processes={processes}
                       loading={supervisorLoading}
                       onRefresh={loadSupervisor}
                       onRestart={restartProcess}
                       onLog={viewLog}/>
      )}

      <LogBar entries={log} open={logOpen} onToggle={() => setLogOpen(o => !o)}/>

      {modal && (
        <UpgradeModal item={modal.item}
                      batch={modal.batch}
                      upgradeState={upgradeState}
                      onClose={() => { setModal(null); setUpgradeState(null); }}
                      onConfirm={onConfirmUpgrade}/>
      )}
      {logModal && <LogModal name={logModal.name} content={logModal.content} onClose={() => setLogModal(null)}/>}

      <TweaksPanel>
        <TweakSection label="主题"/>
        <TweakColor label="主色" value={t.accent}
                    options={['#D4623A', '#3F6E91', '#5C8A4A', '#7A5AE0']}
                    onChange={(v) => setTweak('accent', v)}/>
        <TweakToggle label="深色模式" value={t.dark} onChange={(v) => setTweak('dark', v)}/>
        <TweakSection label="布局"/>
        <TweakRadio label="卡片密度" value={t.density}
                    options={['compact', 'regular', 'comfy']}
                    onChange={(v) => setTweak('density', v)}/>
      </TweaksPanel>
    </div>
  );
}

function mergeCard(card, latestCard) {
  const meta = window.ITEM_META[card.id] || {};
  const source = latestCard || card;
  return {
    id: card.id,
    name: meta.name || card.name || card.id,
    repo: meta.repo || card.name || card.id,
    type: meta.type || card.category || 'unknown',
    risk: meta.risk || card.risk || 'low',
    desc: meta.desc || '',
    current: source.current_version ?? card.current_version ?? null,
    latest: source.latest_version ?? null,
    status: mapStatus(source.state || card.state),
    lastCheck: new Date().toLocaleTimeString('en-GB', { hour12: false }),
  };
}

function mapStatus(status) {
  if (status === 'up_to_date') return 'latest';
  if (status === 'in_progress') return 'unknown';
  return status || 'unknown';
}

function stringifyError(e) {
  if (typeof e === 'string') return e;
  if (e?.message) return e.message;
  try { return JSON.stringify(e); } catch (_) { return String(e); }
}

function hexToRgb(h) {
  const m = h.replace('#', '').match(/.{2}/g);
  return m ? m.map(x => parseInt(x, 16)) : [0, 0, 0];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function shade(hex, pct) {
  const [r, g, b] = hexToRgb(hex);
  const f = pct / 100;
  return rgbToHex(r + (f < 0 ? r * f : (255 - r) * f),
                  g + (f < 0 ? g * f : (255 - g) * f),
                  b + (f < 0 ? b * f : (255 - b) * f));
}
function tint(hex, dark) {
  const [r, g, b] = hexToRgb(hex);
  if (dark) return `rgb(${Math.round(r * 0.35)},${Math.round(g * 0.35)},${Math.round(b * 0.35)})`;
  return `rgb(${Math.round(r + (255 - r) * 0.78)},${Math.round(g + (255 - g) * 0.78)},${Math.round(b + (255 - b) * 0.78)})`;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
