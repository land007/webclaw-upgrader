// components.jsx — UI building blocks

const Icon = ({ name, size = 16, stroke = 1.6 }) => {
  const paths = {
    claw: <g><path d="M5 4c0 5 3 8 7 8s7-3 7-8" /><path d="M9 12v4" /><path d="M12 13v5" /><path d="M15 12v4" /></g>,
    search: <g><circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/></g>,
    scan: <g><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M3 12h18"/></g>,
    settings: <g><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4.9a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.5a7 7 0 0 0-2 1.2L5.1 5.8l-2 3.5 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.5 2 3.5 2.4-.9a7 7 0 0 0 2 1.2L10 21h4l.5-2.5a7 7 0 0 0 2-1.2l2.4.9 2-3.5-2-1.5A7 7 0 0 0 19 12Z"/></g>,
    sun: <g><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></g>,
    moon: <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10Z"/>,
    refresh: <g><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></g>,
    check: <path d="m5 12 5 5L20 7"/>,
    x: <path d="M6 6l12 12M18 6 6 18"/>,
    chevronDown: <path d="m6 9 6 6 6-6"/>,
    chevronUp: <path d="m6 15 6-6 6 6"/>,
    upgrade: <g><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></g>,
    lock: <g><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></g>,
    alert: <g><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z"/></g>,
    info: <g><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></g>,
    copy: <g><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></g>,
    terminal: <g><path d="M4 17l5-5-5-5"/><path d="M11 19h9"/></g>,
    clock: <g><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></g>,
    list: <g><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></g>,
    fileText: <g><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8M8 9h2"/></g>,
  };
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
         fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
};

const ClawLogo = ({ size = 34 }) => (
  <>
    <img className="hdr-logo-img logo-light" src="assets/claw-black.png" width={size} height={size} alt="" />
    <img className="hdr-logo-img logo-dark" src="assets/claw-white.png" width={size} height={size} alt="" />
  </>
);

const Header = ({ counts, lastScan, onScan, scanning, dark, onToggleDark, onOpenTweaks }) => (
  <header className="hdr">
    <div className="hdr-logo"><ClawLogo size={24}/></div>
    <div className="hdr-title">
      <h1>WebClaw 升级中心</h1>
      <small>容器内软件清单 · manifest: {counts.total} 项</small>
    </div>
    <div className="hdr-path">
      <Icon name="terminal" size={13}/> ~/webclaw/upgrade.manifest.json
    </div>
    <div className="hdr-spacer"/>
    <div className="hdr-meta">
      <span>上次扫描</span>
      <strong>{lastScan || '未扫描'}</strong>
    </div>
    <button className="btn btn-ghost btn-icon" aria-label="设置" onClick={onOpenTweaks}><Icon name="settings" size={15}/></button>
    <button className="theme-toggle" onClick={onToggleDark} aria-label="切换深浅模式">
      <Icon name={dark ? 'sun' : 'moon'} size={14}/>
    </button>
    <button className={`btn ${scanning ? '' : 'btn-primary'}`} onClick={onScan} disabled={scanning}>
      {scanning
        ? <><Icon name="refresh" size={14} stroke={2}/> 扫描中...</>
        : <><Icon name="scan" size={14} stroke={2}/> 扫描清单</>}
    </button>
  </header>
);

const Stats = ({ counts, active, onPick }) => {
  const tiles = [
    { key: 'all', n: counts.total, lbl: '总项', cls: 'c-ink' },
    { key: 'upgradable', n: counts.upgradable, lbl: '可升级', cls: 'c-accent' },
    { key: 'latest', n: counts.latest, lbl: '已最新', cls: 'c-ok' },
    { key: 'unknown', n: counts.unknown, lbl: '待检测', cls: 'c-warn' },
    { key: 'locked', n: counts.locked, lbl: '已锁定', cls: 'c-info' },
    { key: 'highrisk', n: counts.highrisk, lbl: '高风险', cls: 'c-danger' },
  ];
  return (
    <div className="stats">
      {tiles.map(t => (
        <div key={t.key} className={`stat ${active === t.key ? 'active' : ''}`} onClick={() => onPick(t.key)}>
          <div className={`stat-num ${t.cls}`}>{t.n}</div>
          <div className="stat-lbl">{t.lbl}</div>
        </div>
      ))}
    </div>
  );
};

const Toolbar = ({ filter, onFilter, counts, q, onQ, sort, onSort }) => {
  const chips = [
    { k: 'all', l: '全部', n: counts.total },
    { k: 'upgradable', l: '可升级', n: counts.upgradable },
    { k: 'latest', l: '已最新', n: counts.latest },
    { k: 'unknown', l: '待检测', n: counts.unknown },
    { k: 'locked', l: '已锁定', n: counts.locked },
  ];
  return (
    <div className="toolbar">
      <div className="chips" role="tablist">
        {chips.map(c => (
          <button key={c.k} className={`chip ${filter === c.k ? 'active' : ''}`} onClick={() => onFilter(c.k)}>
            {c.l}<span className="chip-count">{c.n}</span>
          </button>
        ))}
      </div>
      <div className="search">
        <span className="search-icon"><Icon name="search" size={14}/></span>
        <input value={q} onChange={(e) => onQ(e.target.value)} placeholder="搜索软件 / 类型 / 版本号..." />
      </div>
      <div className="spacer-x"/>
      <div className="sort">
        排序
        <select value={sort} onChange={(e) => onSort(e.target.value)}>
          <option value="priority">可升级优先</option>
          <option value="risk">风险高优先</option>
          <option value="name">名称 A-Z</option>
          <option value="type">类型分组</option>
        </select>
      </div>
    </div>
  );
};

const Tabs = ({ tab, onTab }) => (
  <div className="tabs">
    <button className={`tab ${tab === 'software' ? 'active' : ''}`} onClick={() => onTab('software')}>软件升级</button>
    <button className={`tab ${tab === 'supervisor' ? 'active' : ''}`} onClick={() => onTab('supervisor')}>进程状态</button>
  </div>
);

const Card = ({ item, selected, onSelect, onUpgrade, onRecheck, dense }) => {
  const dotCls = ({ upgradable: 'up', latest: 'ok', unknown: 'unk', locked: 'lock', error: 'fatal' })[item.status] || 'unk';
  const cardCls = ['card', item.status === 'upgradable' ? 'upgradable' : '', selected ? 'selected' : ''].filter(Boolean).join(' ');
  return (
    <div className={cardCls}>
      <div className="card-head">
        <span className={`dot ${dotCls}`} aria-hidden/>
        <div className="card-title-wrap">
          <div className="card-title">{item.name}</div>
          <div className="card-sub">{item.repo}</div>
        </div>
        <span className="tag tag-type">{item.type}</span>
        {item.status === 'upgradable' && <span className="tag tag-up">可升级</span>}
        {item.status === 'latest' && <span className="tag tag-ok">已最新</span>}
        {item.status === 'unknown' && <span className="tag tag-warn">待检测</span>}
        {item.status === 'error' && <span className="tag tag-danger">错误</span>}
      </div>
      <div className="versions">
        <span className={`ver current ${item.current ? '' : 'unknown'}`}>{item.current ?? '未检测'}</span>
        <span className="ver-arrow">→</span>
        {item.latest
          ? <span className={`ver ${item.status === 'upgradable' ? 'latest' : 'equal'}`}>{item.latest}</span>
          : <span className="ver unknown">?</span>}
      </div>
      {!dense && (
        <div className="meta-row">
          <span className="meta-key">风险</span>
          <span className={`meta-val risk risk-${item.risk}`}>
            <span className="risk-dot"/>
            {{ low: '低', medium: '中', high: '高' }[item.risk] || item.risk}
          </span>
          <span className="meta-key">检测</span>
          <span className="meta-val">{item.lastCheck}</span>
        </div>
      )}
      <div className="card-foot">
        <button className={`card-checkbox ${selected ? 'on' : ''}`} onClick={() => onSelect(item.id)} title={selected ? '取消选中' : '加入批量'}>
          {selected && <Icon name="check" size={11} stroke={3}/>}
        </button>
        <button className={`btn btn-sm ${item.status === 'upgradable' ? 'btn-accent' : ''}`} onClick={() => onUpgrade(item)} disabled={item.status === 'latest'}>
          {item.status === 'unknown' ? '检测并升级' : '升级'}
        </button>
        <button className="btn btn-sm" onClick={() => onRecheck(item.id)}>
          <Icon name="refresh" size={12}/> 重新检测
        </button>
        <div className="spacer"/>
        <button className="btn-icon" title={item.desc || '软件信息'}>
          <Icon name="info" size={13}/>
        </button>
      </div>
    </div>
  );
};

const LockedCard = ({ item, onCopy }) => (
  <div className="card locked">
    <div className="card-head">
      <span className="dot lock"/>
      <div className="card-title-wrap">
        <div className="card-title">{item.name}</div>
        <div className="card-sub">{item.file} · pinned</div>
      </div>
      <span className="tag tag-lock"><Icon name="lock" size={10}/>&nbsp;已锁定 {item.pinned}</span>
    </div>
    <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.55 }}>{item.note}</div>
    <code className="codeblock">{item.snippet}</code>
    <div className="card-foot">
      <button className="btn btn-sm" onClick={() => onCopy(item.snippet)}><Icon name="copy" size={12}/> 复制片段</button>
      <div className="spacer"/>
      <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>修改 {item.file} 后重建镜像生效</span>
    </div>
  </div>
);

const BatchBar = ({ count, onClear, onUpgrade, onRecheck }) => (
  <div className="batch">
    <span className="batch-info">已选中 <b>{count}</b> 项</span>
    <div style={{ flex: 1 }}/>
    <button className="btn btn-sm" onClick={onRecheck} style={{ background: 'transparent', color: 'var(--bg)', borderColor: 'rgba(255,255,255,.2)' }}>
      <Icon name="refresh" size={12}/> 批量重新检测
    </button>
    <button className="btn btn-sm btn-accent" onClick={onUpgrade}><Icon name="upgrade" size={12}/> 批量升级</button>
    <button className="btn btn-sm" onClick={onClear} style={{ background: 'transparent', color: 'var(--bg)', borderColor: 'rgba(255,255,255,.2)' }}>取消</button>
  </div>
);

const LogBar = ({ entries, open, onToggle }) => {
  const last = entries[entries.length - 1];
  return (
    <div className={`logbar ${open ? 'open' : ''}`}>
      <div className="logbar-head" onClick={onToggle}>
        <Icon name="terminal" size={13}/>
        <span className="label">操作日志</span>
        <span className="badge">{entries.length}</span>
        {!open && last && <span className="latest">[{last.ts}] {last.msg}</span>}
        <div style={{ flex: 1 }}/>
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{open ? '收起' : '展开'}</span>
        <Icon name={open ? 'chevronDown' : 'chevronUp'} size={14}/>
      </div>
      <div className="logbar-body">
        {entries.map((e, i) => (
          <div key={i} className="logline">
            <span className="log-ts">[{e.ts}]</span>
            <span className={`log-msg ${e.tone || ''}`}>{e.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

function formatUptime(seconds) {
  if (seconds == null) return '未运行';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

const ProcessCard = ({ process, onRestart, onLog }) => {
  const state = String(process.state || '').toUpperCase();
  const dotCls = state === 'RUNNING' ? 'ok' : state === 'FATAL' ? 'fatal' : 'unk';
  return (
    <div className={`card process-card process-${state.toLowerCase()}`}>
      <div className="card-head">
        <span className={`dot ${dotCls}`} aria-hidden/>
        <div className="card-title-wrap">
          <div className="card-title">{process.name}</div>
          <div className="card-sub">{process.description || '无描述'}</div>
        </div>
        <span className={`tag ${state === 'RUNNING' ? 'tag-ok' : state === 'FATAL' ? 'tag-danger' : 'tag-warn'}`}>{state}</span>
      </div>
      <div className="process-metrics">
        <div><span>PID</span><strong>{process.pid ?? '-'}</strong></div>
        <div><span>Uptime</span><strong>{formatUptime(process.uptime_secs)}</strong></div>
      </div>
      <div className="card-foot">
        <button className="btn btn-sm btn-accent" onClick={() => onRestart(process.name)}><Icon name="refresh" size={12}/> 重启</button>
        <button className="btn btn-ghost btn-sm" onClick={() => onLog(process.name)}><Icon name="fileText" size={12}/> 查看日志</button>
      </div>
    </div>
  );
};

const SupervisorTab = ({ processes, loading, onRefresh, onRestart, onLog }) => (
  <>
    <div className="supervisor-toolbar">
      <div>
        <h2>Supervisor 进程状态</h2>
        <span>{processes.length ? `${processes.length} 个进程` : '点击刷新读取 supervisorctl status'}</span>
      </div>
      <button className="btn btn-primary" onClick={onRefresh} disabled={loading}>
        <Icon name="refresh" size={14}/>{loading ? '刷新中...' : '刷新'}
      </button>
    </div>
    <div className="grid">
      {processes.map(p => (
        <ProcessCard key={p.name} process={p} onRestart={onRestart} onLog={onLog}/>
      ))}
      {!processes.length && (
        <div className="empty-panel">暂无进程数据</div>
      )}
    </div>
  </>
);

const LogModal = ({ name, content, onClose }) => (
  <div className="modal-backdrop" onClick={onClose}>
    <div className="modal log-modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-head">
        <h3>{name} · 日志</h3>
        <button className="btn-icon btn-ghost" onClick={onClose}><Icon name="x" size={14}/></button>
      </div>
      <div className="modal-body">
        <pre className="log-pre">{content || '无日志输出'}</pre>
      </div>
    </div>
  </div>
);

const UpgradeModal = ({ item, batch, upgradeState, onClose, onConfirm }) => {
  const [acked, setAcked] = React.useState(false);
  const targets = batch || [item];
  const phase = upgradeState?.phase || 'confirm';
  const stage = String(upgradeState?.stage || 'CHECKING').toUpperCase();
  const percent = Math.max(0, Math.min(100, Number(upgradeState?.percent || 0)));
  const doneOk = phase === 'done' && stage !== 'ERROR';

  return (
    <div className="modal-backdrop" onClick={phase === 'running' ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{batch ? `批量升级 · ${batch.length} 项` : `升级 ${item.name}`}</h3>
          <button className="btn-icon btn-ghost" onClick={onClose} disabled={phase === 'running'}><Icon name="x" size={14}/></button>
        </div>
        {phase === 'confirm' && (
          <>
            <div className="modal-body">
              <div className="callout">
                <span className="callout-icon"><Icon name="alert" size={16}/></span>
                <div><strong>升级前建议先在 webclaw-launcher 中做一次卷快照。</strong><br/>本助手不自动回滚，如升级失败需从快照恢复。</div>
              </div>
              <div>
                <div className="modal-label">即将执行</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {targets.map(t => (
                    <code key={t.id} className="codeblock">
                      <span style={{ color: 'var(--ink-3)' }}># </span>
                      升级 {t.id} <span style={{ color: 'var(--ink-3)' }}>({t.current ?? '未检测'} → {t.latest ?? '最新版'})</span>
                    </code>
                  ))}
                </div>
              </div>
              <div className="check-row" onClick={() => setAcked(!acked)}>
                <span className={`card-checkbox ${acked ? 'on' : ''}`}>{acked && <Icon name="check" size={11} stroke={3}/>}</span>
                我已在 launcher 完成卷快照（或确认无需回滚）
              </div>
            </div>
            <div className="modal-foot">
              <div className="spacer"/>
              <button className="btn btn-sm" onClick={onClose}>取消</button>
              <button className="btn btn-sm btn-accent" disabled={!acked} onClick={() => onConfirm(targets, acked)}>开始升级</button>
            </div>
          </>
        )}
        {phase === 'running' && (
          <>
            <div className="modal-body">
              <div className="callout callout-info">
                <span className="callout-icon"><Icon name="refresh" size={16}/></span>
                <div>正在升级 · {stage}</div>
              </div>
              <div className="progress"><div style={{ width: `${percent}%` }}/></div>
              <pre className="upgrade-output">{(upgradeState?.lines || []).join('\n') || '等待 Rust 端输出...'}</pre>
            </div>
            <div className="modal-foot">
              <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>失败可从 launcher 快照恢复</span>
              <div className="spacer"/>
              <button className="btn btn-sm" disabled>升级中...</button>
            </div>
          </>
        )}
        {phase === 'done' && (
          <>
            <div className="modal-body">
              <div className="callout" style={{ background: doneOk ? 'var(--ok-tint)' : 'var(--danger-tint)', color: doneOk ? 'var(--ok)' : 'var(--danger)' }}>
                <span className="callout-icon"><Icon name={doneOk ? 'check' : 'alert'} size={16} stroke={2.4}/></span>
                <div><strong>{doneOk ? '升级完成。' : '升级失败。'}</strong><br/>{targets.length} 项任务已结束。</div>
              </div>
              <pre className="upgrade-output">{(upgradeState?.lines || []).join('\n') || '无输出'}</pre>
            </div>
            <div className="modal-foot">
              <div className="spacer"/>
              <button className="btn btn-sm btn-accent" onClick={onClose}>知道了</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

Object.assign(window, {
  Icon, ClawLogo, Header, Stats, Toolbar, Tabs,
  Card, LockedCard, BatchBar, LogBar, UpgradeModal,
  ProcessCard, SupervisorTab, LogModal, formatUptime,
});
