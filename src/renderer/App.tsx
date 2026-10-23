import { useEffect, useRef, useState } from 'react';
import { Globe2, Rocket, Terminal, Settings2, Info, FolderOpen, ChevronRight, ArrowUpRight, Check, ShieldCheck, Monitor, Languages, Clock3, Search, Save, FileCode2, Square, Unplug, Copy, Download, Trash2, CircleDot, Sun, Moon, Laptop, ChevronDown } from 'lucide-react';
import { Button, Switch } from './components/ui';
import { TextModules } from './components/TextModules';
import { Profiles } from './components/Profiles';
import { snapshotDraft } from '../shared/profiles';
import { defaults, timezones, type Settings, type Message, type Bridge } from '../shared/types';
import regions from '../../resources/presets/regions.json';
import { version as appVersion } from '../../package.json';
declare global { interface Window { launcher?: Bridge } }
type Log = { timestamp: string; level: string; source: string; pid?: number; api?: string; original?: unknown; simulated?: unknown; status?: unknown; text?: string };
const localeLabels: Record<string, string> = { 'en-US': '英语（美国）', 'zh-CN': '中文（简体）', 'zh-TW': '中文（繁体）', 'ja-JP': '日语（日本）', 'de-DE': '德语（德国）', 'fr-FR': '法语（法国）', 'ko-KR': '韩语（韩国）' };
const eventLabels: Record<string,string> = { child_started: '子进程已创建，正在注入', child_hook_loaded: '子进程 Hook 已加载', child_resumed: '子进程已恢复', child_exited: '子进程已退出', child_detached: '子进程已停止监控', process_tree: '受监控进程列表已更新', backend_ready: 'Frida 后端已就绪', process_started: '目标已创建，正在注入', hook_loaded: 'Hook 初始化完成，等待实际调用', process_resumed: '目标进程已恢复运行', process_exited: '目标进程已退出', detached: '已停止监控，目标程序继续运行', backend_error: '后端连接已断开' };
const show = (value: unknown) => value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
function LocaleSelect({ value, onChange, label }: { value: string; onChange: (s: any) => void; label: string }) { return <label className="field"><span>{label}</span><select value={value} onChange={e => onChange(e.target.value)}>{Object.entries(localeLabels).map(([key, text]) => <option value={key} key={key}>{text} · {key}</option>)}</select></label>; }
export default function App() {
  const [settings, setSettings] = useState<Settings>(structuredClone(defaults));
  const [loaded, setLoaded] = useState(false), [page, setPage] = useState('launch');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [icon, setIcon] = useState<string|null>(null), [drag, setDrag] = useState(false), [search, setSearch] = useState('');
  const [logs, setLogs] = useState<Log[]>([]), [filter, setFilter] = useState(''), [level, setLevel] = useState('ALL');
  const [status, setStatus] = useState('idle'), [pid, setPid] = useState<number>(), [hooks, setHooks] = useState(0), [hits, setHits] = useState(0), [started, setStarted] = useState(0), [now, setNow] = useState(Date.now());
  const [processes, setProcesses] = useState<{pid:number; parentPid:number|null; role:string; state:string; hookCount:number}[]>([]);
  const pending = useRef<Log[]>([]), logEnd = useRef<HTMLDivElement>(null);
  const profile = settings.profile;
  const active = status === 'running' || status === 'initializing';
  const update = (patch: Partial<typeof profile>) => setSettings(s => ({ ...s, profile: { ...s.profile, ...patch } }));
  const fail = (e: unknown) => setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(e));
  const api = () => { if (!window.launcher) throw new Error('请通过 Electron 桌面应用运行。浏览器预览无法启动目标进程。'); return window.launcher; };
  useEffect(() => {
    if (!window.launcher) { setLoaded(true); return; }
    let alive = true;
    window.launcher.load().then(value => { if (alive) { setSettings(value); setLoaded(true); } }).catch(fail);
    const off = window.launcher.onMessage((m: Message) => {
      if (m.type !== 'event') return;
      if (m.event === 'hook_event') {
        const events = (m.payload?.events || []) as Log[];
        pending.current.push(...events.map(e => ({ ...e, pid: m.pid })));
        const dropped = Number(m.payload?.dropped || 0); setHits(n => n + events.length + dropped);
        if (dropped) pending.current.push({ timestamp: m.timestamp, level: 'WARN', source: 'frida', text: `高频事件限流：合并省略 ${dropped} 条事件` });
      } else {
        pending.current.push({ timestamp: m.timestamp, level: m.error ? 'ERROR' : m.event === 'backend_diagnostic' ? 'DEBUG' : 'INFO', source: 'backend', pid: m.pid, text: m.error || String(m.payload?.text || eventLabels[m.event || ''] || m.event) });
      }
      if (m.event === 'process_tree') { setProcesses((m.payload?.processes || []) as typeof processes); setStatus(String(m.payload?.state || 'idle')); setPid(m.payload?.pid ? Number(m.payload.pid) : undefined); }
      if (m.event === 'process_started') { setStatus('initializing'); setPid(m.pid); setHits(0); setHooks(0); }
      if (m.event === 'hook_loaded') setHooks(Number(m.payload?.hookCount || 0));
      if (m.event === 'process_resumed') { setStatus('running'); setStarted(Date.now()); }
      if (m.event === 'process_exited' || m.event === 'detached') { setStatus(m.event === 'detached' ? 'detached' : 'exited'); setPid(undefined); }
      if (m.event === 'backend_error') { setStatus('error'); setPid(undefined); setProcesses([]); }
      if (m.error) setError(m.error);
    });
    return () => { alive = false; off(); };
  }, []);
  useEffect(() => { const id = setInterval(() => { setNow(Date.now()); if (pending.current.length) { const batch = pending.current.splice(0); setLogs(old => [...old, ...batch].slice(-2000)); } }, 200); return () => clearInterval(id); }, []);
  useEffect(() => { if (settings.autoScroll) logEnd.current?.scrollIntoView({ block: 'nearest' }); }, [logs, settings.autoScroll]);
  useEffect(() => { const media = matchMedia('(prefers-color-scheme: dark)'); const apply = () => document.documentElement.dataset.theme = settings.theme === 'system' ? media.matches ? 'dark' : 'light' : settings.theme; apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply); }, [settings.theme]);
  useEffect(() => { let alive = true; setIcon(null); window.launcher?.icon(profile.exe).then(value => { if (alive) setIcon(value); }).catch(() => {}); return () => { alive = false; }; }, [profile.exe]);
  const choose = async () => { try { const path = await api().selectExe(); if (path) update({ exe: path, cwd: '' }); } catch(e) { fail(e); } };
  const persist = async (value: Settings) => { const next = snapshotDraft(value); await api().save(next); setSettings(next); };
  const save = async () => { try { await persist(settings); setNotice('配置已保存'); setTimeout(() => setNotice(''), 2500); } catch(e) { fail(e); } };
  const launch = async (chosen: Settings = settings) => {
    setBusy(true); setError(''); setStatus('initializing');
    try {
      const next = snapshotDraft({ ...chosen, recent: [chosen.profile.exe, ...chosen.recent.filter(p => p !== chosen.profile.exe)].slice(0, 12) });
      await api().save(next); setSettings(next);
      await api().command('launch', next.profile);
    } catch(e) { fail(e); setStatus('error'); } finally { setBusy(false); }
  };
  const control = async (command: 'stop'|'detach') => { setBusy(true); try { await api().command(command); } catch(e) { fail(e); } finally { setBusy(false); } };
  const logText = logs.map(l => `${l.timestamp} [${l.level}] ${l.source} PID=${l.pid ?? '-'} ${l.api || ''} ${l.text || `${show(l.original)} -> ${show(l.simulated)} (status=${show(l.status)})`}`).join('\n');
  const visible = logs.filter(l => (level === 'ALL' || l.level === level) && JSON.stringify(l).toLowerCase().includes(filter.toLowerCase()));
  const name = profile.exe.split(/[\\/]/).pop();
  const selected = regions.find(r => r.geoId === profile.deviceRegion.geoId);
  const elapsed = started ? Math.max(0, Math.floor((now - started) / 1000)) : 0;
  const enabledCount = Number(profile.deviceRegion.enabled) + Number(profile.language.enabled) + Number(profile.locale.enabled) + Number(profile.timezone.enabled) + Number(profile.geoRegion.enabled) + Number(profile.encoding.enabled) + Number(profile.font.enabled);
  return <div className="app-shell" onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false); }} onDrop={e => { e.preventDefault(); setDrag(false); try { const file = e.dataTransfer.files[0]; if (file) { const path = api().filePath(file); if (!/\.exe$/i.test(path)) throw new Error('请拖入 Windows EXE 文件'); update({ exe: path, cwd: '' }); } } catch(error) { fail(error); } }}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><Globe2 size={25}/></div><div>Frida Region<span>LAUNCHER</span></div></div>
      <div className="workspace-label">工作空间</div>
      <nav>{[['launch', '启动程序', Rocket], ['profiles', '程序配置', FileCode2], ['logs', '运行日志', Terminal], ['settings', '设置', Settings2], ['about', '关于', Info]].map(([key, label, Icon]) => { const Glyph = Icon as typeof Rocket; return <button key={String(key)} className={page === key ? 'nav-item selected' : 'nav-item'} onClick={() => setPage(String(key))}><Glyph size={18}/>{String(label)}{key === 'logs' && logs.length > 0 && <span className="nav-count">{logs.length}</span>}</button>; })}</nav>
      <div className="sidebar-note"><ShieldCheck size={21}/><strong>仅在进程内生效</strong><p>保持系统设置与原始程序文件不变。</p></div>
      <div className="sidebar-bottom"><span className="dot"/>本地运行 <span>v{appVersion}</span></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div>工作空间 <ChevronRight size={14}/><span>{{ launch: '启动程序', profiles: '程序配置', logs: '运行日志', settings: '设置', about: '关于' }[page]}</span></div><span className="platform"><Monitor size={14}/> WINDOWS · X64</span></header>
      <main>
        {error && <div role="alert" className="alert"><Info size={17}/><span>{error}</span><button aria-label="关闭错误" onClick={() => setError('')}>×</button></div>}
        {notice && <div role="status" className="toast"><Check size={16}/>{notice}</div>}
        {page === 'launch' && <>
          <div className="page-heading"><div><div className="eyebrow">YOUR APP. YOUR REGION.</div><h1>在不同地区，自由运行。</h1><p>为应用创建独立的区域环境，从一次启动开始。</p></div><Button variant="outline" onClick={save} disabled={!loaded}><Save size={16}/>保存配置</Button></div>
          <section className="target-card card"><div className="section-title"><span className="step">01</span><h2>目标程序</h2><span className="muted">保持原始文件，不重新打包</span></div>
            <div className={'file-zone ' + (drag ? 'dragging' : '')}><div className="file-icon">{icon ? <img src={icon} alt="目标程序图标"/> : <FileCode2 size={28}/>}</div><div className="file-details"><strong>{name || '选择一个 Windows 应用'}</strong><span>{profile.exe || '将 EXE 拖到窗口，或浏览本地文件'}</span></div><Button variant="outline" onClick={choose}><FolderOpen size={16}/>浏览文件</Button></div>
            <label className="field path-field"><span>程序路径</span><input aria-label="程序路径" value={profile.exe} placeholder="C:\Apps\Example.exe" onChange={e => update({ exe: e.target.value })}/></label>
            <div className="two-fields"><label className="field"><span>启动参数 <small>可选</small></span><input value={profile.args} onChange={e => update({ args: e.target.value })} placeholder={'例如：--profile "我的配置"'}/></label><label className="field"><span>工作目录 <small>默认使用程序所在目录</small></span><div className="input-button"><input value={profile.cwd} onChange={e => update({ cwd: e.target.value })} placeholder="跟随 EXE 所在目录"/><button aria-label="选择工作目录" onClick={async () => { try { const path = await api().selectDirectory(); if (path) update({ cwd: path }); } catch(e) { fail(e); } }}><FolderOpen size={17}/></button></div></label></div>
          </section>
          <div className="section-title outside"><span className="step">02</span><h2>模拟环境</h2><span className="muted">每项设置独立生效</span><span className="pill">{enabledCount} 项已启用</span></div>
          <div className="card preset-panel"><div><strong>日本兼容预设</strong><p>日本 GeoID 122 · 日语 UI / 格式 · 东京 UTC+9，与已验证参考脚本的设置对应。</p></div><Button variant="outline" onClick={() => { update({ deviceRegion: { enabled: true, geoId: 122 }, language: { enabled: true, userUI: 'ja-JP', systemUI: 'ja-JP' }, locale: { enabled: true, user: 'ja-JP', system: 'ja-JP' }, timezone: { enabled: true, key: 'Tokyo Standard Time' }, geoRegion: { enabled: true, geoId: 122 } }); setNotice('已应用日本兼容预设；启动前请退出目标程序的旧实例'); setTimeout(() => setNotice(''), 5000); }}>应用日本兼容预设</Button></div>
          <div className="environment-grid">
            <section className={'card region-card ' + (profile.deviceRegion.enabled ? 'enabled' : '')}><div className="module-heading"><div className="module-icon blue"><Globe2 size={21}/></div><div><h3>OOBE 安装地区 <span className="tiny-tag">核心</span></h3><p>模拟 Windows 首次安装时的设备地区</p></div><Switch aria-label="启用 OOBE 安装地区" checked={profile.deviceRegion.enabled} onCheckedChange={enabled => update({ deviceRegion: { ...profile.deviceRegion, enabled } })}/></div>
              <div className={!profile.deviceRegion.enabled ? 'module-body dimmed' : 'module-body'}><div className="region-selected"><div><span>虚拟设备地区</span><strong>{selected?.name || '自定义地区'} <small>{selected?.english || 'Custom GeoID'}</small></strong></div><span className="geo-badge">GeoID {profile.deviceRegion.geoId}</span></div>
                <div className="search-input"><Search size={16}/><input aria-label="搜索地区" placeholder="搜索国家、地区或 GeoID…" value={search} onChange={e => setSearch(e.target.value)}/></div>
                <div className="region-chips">{regions.filter(r => `${r.name} ${r.english} ${r.geoId}`.toLowerCase().includes(search.toLowerCase())).map(r => <button key={r.geoId} className={r.geoId === profile.deviceRegion.geoId ? 'chosen' : ''} onClick={() => update({ deviceRegion: { ...profile.deviceRegion, geoId: r.geoId } })}>{r.name}{r.geoId === profile.deviceRegion.geoId && <Check size={13}/>}</button>)}</div>
                <label className="custom-geo">自定义 GeoID <input type="number" min="1" max="2147483647" value={profile.deviceRegion.geoId} onChange={e => update({ deviceRegion: { ...profile.deviceRegion, geoId: Number(e.target.value) } })}/><span>Windows 地理位置标识符</span></label>
              </div><div className="module-footer"><ShieldCheck size={14}/>精确拦截 DeviceRegion，不写入真实注册表</div>
            </section>
            <div className="module-stack">
              <section className="card"><div className="module-heading"><div className="module-icon teal"><Globe2 size={20}/></div><div><h3>用户所在地区</h3><p>GeoID / GeoName，与 OOBE 安装地区独立</p></div><Switch aria-label="启用用户地区" checked={profile.geoRegion.enabled} onCheckedChange={enabled => update({ geoRegion: { ...profile.geoRegion, enabled } })}/></div><div className="module-body"><label className="field"><span>用户地区预设</span><select aria-label="用户地区预设" value={regions.some(r => r.geoId === profile.geoRegion.geoId) ? profile.geoRegion.geoId : ''} onChange={e => update({ geoRegion: { ...profile.geoRegion, geoId: Number(e.target.value) } })}><option value="" disabled>自定义 GeoID</option>{regions.map(r => <option key={r.geoId} value={r.geoId}>{r.name} · {r.geoId}</option>)}</select></label><label className="custom-geo">自定义用户 GeoID <input aria-label="自定义用户 GeoID" type="number" min="1" max="2147483647" value={profile.geoRegion.geoId} onChange={e => update({ geoRegion: { ...profile.geoRegion, geoId: Number(e.target.value) } })}/></label><p className="muted">启动时由 Windows 验证标识符并解析地区名称。</p></div></section>
              <section className="card"><div className="module-heading"><div className="module-icon purple"><Languages size={20}/></div><div><h3>Windows UI 语言</h3><p>分别模拟用户与系统的界面语言</p></div><Switch aria-label="启用 UI 语言" checked={profile.language.enabled} onCheckedChange={enabled => update({ language: { ...profile.language, enabled } })}/></div><div className={'two-fields module-body ' + (!profile.language.enabled ? 'dimmed' : '')}><LocaleSelect label="用户 UI" value={profile.language.userUI} onChange={userUI => update({ language: { ...profile.language, userUI } })}/><LocaleSelect label="系统 UI" value={profile.language.systemUI} onChange={systemUI => update({ language: { ...profile.language, systemUI } })}/></div></section>
              <section className="card"><div className="module-heading"><div className="module-icon teal"><CircleDot size={20}/></div><div><h3>区域格式 / Locale</h3><p>覆盖 LANGID / LCID、Locale 与默认格式 API</p></div><Switch aria-label="启用区域格式" checked={profile.locale.enabled} onCheckedChange={enabled => update({ locale: { ...profile.locale, enabled } })}/></div><div className={'two-fields module-body ' + (!profile.locale.enabled ? 'dimmed' : '')}><LocaleSelect label="用户 Locale" value={profile.locale.user} onChange={user => update({ locale: { ...profile.locale, user } })}/><LocaleSelect label="系统 Locale" value={profile.locale.system} onChange={system => update({ locale: { ...profile.locale, system } })}/></div></section>
            </div>
          </div>
          <section className="card timezone-card"><div className="module-heading"><div className="module-icon blue"><Clock3 size={20}/></div><div><h3>Windows 系统时区</h3><p>使用本机 Windows 动态规则，支持按年查询及夏令时转换</p></div><Switch aria-label="启用时区" checked={profile.timezone.enabled} onCheckedChange={enabled => update({ timezone: { ...profile.timezone, enabled } })}/></div><div className="module-body"><label className="field"><span>模拟时区</span><select aria-label="模拟时区" value={profile.timezone.key} onChange={e => update({ timezone: { ...profile.timezone, key: e.target.value as typeof profile.timezone.key } })}>{timezones.map((key, i) => <option key={key} value={key}>{['东京 · UTC+9', '北京 · UTC+8', '太平洋时间 · 夏令时', '欧洲中部 · 夏令时', '协调世界时 · UTC'][i]} — {key}</option>)}</select></label></div></section>
          <TextModules config={profile} update={update} fail={fail}/>
          <section className="card child-card"><div className="module-heading"><div className="module-icon purple"><FileCode2 size={20}/></div><div><h3>子进程 Hook · 测试功能</h3><p>新建子进程继承本次启动环境；注入成功后恢复，失败则终止该子进程</p></div><Switch aria-label="启用子进程 Hook" checked={profile.children} onCheckedChange={children => update({ children })}/></div><div className="module-body"><p className="muted">默认关闭 · 最多 32 个受监控进程 · 初始化守护超时 25 秒 · 不影响之前已运行的程序</p></div></section>
          {processes.length > 0 && <section className="card process-list"><h3>受监控进程 · {processes.length}</h3>{processes.map(p => <div className="process-row" key={p.pid}><span>{p.role === 'main' ? '主进程' : '子进程'} <b>PID {p.pid}</b>{p.parentPid ? ` ← ${p.parentPid}` : ''}</span><span>{p.state === 'running' ? '运行中' : '正在注入'} · {p.hookCount} API</span></div>)}</section>}
          <div className="future-note"><Info size={15}/><span>启动前请退出目标的旧实例；本次 Hook 不会影响已运行的程序。</span><span>不修改真实系统时钟</span></div>
          <section className="launch-bar"><div className="launch-summary"><span className={'status-ring ' + (active ? 'running' : '')}/><div><strong>{status === 'running' ? '程序运行中' : status === 'initializing' ? '正在准备环境…' : status === 'detached' ? '已停止监控' : status === 'exited' ? '程序已退出' : '准备就绪'}</strong><span>{active ? `${pid ? `主进程 PID ${pid}` : '主进程已退出'} · ${processes.length} 个受监控进程 · 已加载 ${hooks} 个 API Hook · 实际命中 ${hits} 次` : '启动前注入 · 原路径运行 · 进程内模拟'}</span></div></div>{active ? <div className="actions"><Button variant="outline" disabled={busy} onClick={() => control('detach')}><Unplug size={16}/>停止全部监控</Button><Button variant="danger" disabled={busy} onClick={() => control('stop')}><Square size={14}/>终止全部进程</Button></div> : <Button className="launch-button" disabled={!profile.exe || busy || !loaded} onClick={() => void launch()}><Rocket size={18}/>启动程序<ArrowUpRight size={18}/></Button>}</section>
          <p className="footnote">Hook 已加载不代表目标已使用模拟值。实际调用记录可在<button onClick={() => setPage('logs')}>运行日志</button>中查看。</p>
        </>}
        {page === 'profiles' && <Profiles settings={settings} persist={persist} edit={() => setPage('launch')} active={active} launch={async value => { setPage('launch'); await launch(value); }}/>}
        {page === 'logs' && <><div className="page-heading"><div><div className="eyebrow">LIVE ACTIVITY</div><h1>运行日志</h1><p>真实 API 调用、注入状态与进程生命周期。</p></div><span className="pill">最近 {logs.length} 条 / 上限 2000</span></div><div className="log-toolbar"><div className="search-input"><Search size={16}/><input aria-label="过滤日志" value={filter} onChange={e => setFilter(e.target.value)} placeholder="搜索 API、PID 或内容…"/></div><select aria-label="日志级别" value={level} onChange={e => setLevel(e.target.value)}>{['ALL','DEBUG','INFO','HOOK','WARN','ERROR'].map(l => <option key={l}>{l}</option>)}</select><Button variant="outline" onClick={() => { void navigator.clipboard.writeText(logText).catch(fail); }}><Copy size={15}/>复制</Button><Button variant="outline" onClick={() => { try { void api().exportLogs(logText).catch(fail); } catch(e) { fail(e); } }}><Download size={15}/>导出</Button><Button variant="ghost" aria-label="清空日志" onClick={() => { pending.current = []; setLogs([]); }}><Trash2 size={16}/></Button></div><div className="log-console">{visible.length ? visible.map((l, i) => <div className="log-row" key={i}><time>{new Date(l.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}</time><span className={'log-level ' + l.level}>{l.level}</span><span className="log-source">{l.source}{l.pid ? `:${l.pid}` : ''}</span><span>{l.text || <><b>{l.api}</b>　{show(l.original)} <span className="log-arrow">→</span> {show(l.simulated)} <span className="muted">[status {show(l.status)}]</span></>}</span></div>) : <div className="empty"><Terminal size={35}/><h3>等待进程活动</h3><p>启动程序后，此处显示实际发生的事件。</p></div>}<div ref={logEnd}/></div><label className="auto-scroll"><Switch checked={settings.autoScroll} onCheckedChange={autoScroll => setSettings(s => ({ ...s, autoScroll }))}/>自动滚动 <span>100 ms Hook 批处理 · 200 ms 界面更新</span></label></>}
        {page === 'settings' && <><div className="page-heading"><div><div className="eyebrow">PREFERENCES</div><h1>让工作空间适合你</h1><p>设置与当前启动配置保存在本地用户数据目录。</p></div><Button onClick={save}><Save size={16}/>保存设置</Button></div><section className="card settings-card"><h2>外观</h2><p className="muted">选择浅色、深色或跟随 Windows 外观。</p><div className="theme-options">{[['light','浅色',Sun],['dark','深色',Moon],['system','跟随系统',Laptop]].map(([key,label,Icon]) => { const Glyph = Icon as typeof Sun; return <button key={String(key)} className={settings.theme === key ? 'chosen' : ''} onClick={() => setSettings(s => ({ ...s, theme: key as Settings['theme'] }))}><Glyph size={24}/>{String(label)}{settings.theme === key && <Check size={16}/>}</button>; })}</div><div className="setting-line"><span>界面语言</span><span>简体中文</span></div><div className="setting-line"><span>退出启动器时</span><span>卸载 Hook，保留已运行的目标程序</span></div><div className="setting-line"><span>子进程 Hook</span><span>启动页独立开关 · 默认关闭</span></div></section><section className="card settings-card"><div className="section-title"><h2>最近程序</h2><Button variant="ghost" onClick={() => setSettings(s => ({ ...s, recent: [] }))}><Trash2 size={15}/>清空记录</Button></div>{settings.recent.length ? settings.recent.map(path => <button className="recent" key={path} onClick={() => { update({ exe: path, cwd: '' }); setPage('launch'); }}><FileCode2 size={18}/><span>{path}</span><ChevronRight size={16}/></button>) : <p className="muted">尚无启动记录。</p>}</section></>}
        {page === 'about' && <><div className="page-heading"><div><div className="eyebrow">FRIDA REGION LAUNCHER</div><h1>应用的地区，由你选择。</h1><p>v{appVersion} · Windows x64 · 开源桌面工具</p></div><Globe2 className="about-globe" size={70}/></div><section className="card settings-card"><h2>运行时模拟，不改变系统</h2><p>通过 Frida 在指定目标进程内拦截 Windows API。目标 EXE 从原路径运行；启动器不会打包目标程序，也不会写入系统区域设置。</p><h3>当前覆盖范围</h3><p>DeviceRegion：RegOpenKey/RegOpenKeyEx、RegQueryValueEx、RegGetValue 的 A/W 版本和 RegCloseKey。语言：UI、线程、首选语言、LANGID/LCID、Locale 与默认格式 API。用户地区：GeoID / GeoName。时区：东京、北京、太平洋、欧洲中部和 UTC，使用 Windows 动态规则。字符集：ANSI / OEM 默认代码页与默认编码转换。字体：GDI CreateFont 系列 A/W 替换及进程私有字体加载。</p><h3>明确的技术边界</h3><p>不是虚拟机。未启用子进程 Hook 时的子进程、系统服务、服务器端地区判断、直接系统调用和其他缓存路径不会自动受到影响。受保护程序可能无法注入，启动器不会尝试绕过保护。</p><p>不存在的 DeviceRegion 键仅提供只读查询兼容；注册表枚举、写入、事务和通知接口不在 v0.1 覆盖范围内。停止监控后，程序已缓存的模拟结果不会自动清除。</p><div className="module-footer"><ShieldCheck size={16}/>GeoID 预设依据 Microsoft Table of Geographical Locations</div></section></>}
      </main>
      <footer className="statusbar"><span><span className={'dot ' + (active ? 'live' : '')}/>{status === 'running' ? 'Frida 已连接' : status === 'initializing' ? '正在注入' : '等待启动'}</span><span>{active && pid ? `PID ${pid}　·　${Math.floor(elapsed / 60)}m ${elapsed % 60}s　·　` : ''}Electron + Frida <span className="separator">|</span> 本地环境</span></footer>
    </div>{drag && <div className="drop-overlay"><FolderOpen size={48}/><h2>释放以选择 EXE</h2><p>原始程序文件始终保持不变</p></div>}
  </div>;
}
