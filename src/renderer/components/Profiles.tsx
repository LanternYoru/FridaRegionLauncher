import { useState } from 'react';
import { Plus, Copy, Trash2, Download, Upload, Rocket, FileCode2, Pencil, Check } from 'lucide-react';
import { Button } from './ui';
import { addProfiles, removeProfile, selectProfile, snapshotDraft } from '../../shared/profiles';
import type { Settings, ProgramProfile } from '../../shared/types';

function ProfileName({ profile, busy, rename }: { profile: ProgramProfile; busy: boolean; rename: (name: string) => void }) {
  const [value, setValue] = useState(profile.name);
  return <><input aria-label={`配置名称 ${profile.name}`} maxLength={80} value={value} onChange={e => setValue(e.target.value)}/>{value !== profile.name && <Button variant="ghost" aria-label={`保存名称 ${profile.name}`} disabled={busy || !value.trim()} onClick={() => rename(value.trim())}><Check size={16}/></Button>}</>;
}

export function Profiles({ settings, persist, edit, launch, active }: { settings: Settings; persist: (s: Settings) => Promise<void>; edit: () => void; launch: (s: Settings) => Promise<void>; active: boolean }) {
  const [name, setName] = useState(''), [query, setQuery] = useState(''), [deleting, setDeleting] = useState<string|null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const perform = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(String(e)); } finally { setBusy(false); } };
  const current = snapshotDraft(settings);
  const create = async (source?: ProgramProfile) => {
    const entry = { id: crypto.randomUUID(), name: source ? (source.name.slice(0, 75) + ' 副本') : name.trim(), config: structuredClone(source?.config || settings.profile) };
    await persist(selectProfile(addProfiles(current, [entry]), entry.id)); setName('');
  };
  return <>
    <div className="page-heading"><div><div className="eyebrow">APP LIBRARY</div><h1>程序配置</h1><p>为每个应用保存独立环境，切换配置时保留当前编辑。</p></div><span className="pill">{settings.profiles.length} / 100 个配置</span></div>
    {error && <div role="alert" className="alert">{error}</div>}
    <section className="card settings-card"><h2>将当前环境保存为新配置</h2><div className="profile-create"><input aria-label="新配置名称" maxLength={80} placeholder="例如：游戏 · 日本环境" value={name} onChange={e => setName(e.target.value)}/><Button disabled={busy || !name.trim() || settings.profiles.length >= 100} onClick={() => void perform(() => create())}><Plus size={16}/>新增配置</Button></div><p className="muted">复制启动页的程序路径、参数及全部独立开关。导入配置不会自动启动程序。</p></section>
    <div className="log-toolbar"><input aria-label="搜索配置" placeholder="搜索配置名称或程序路径" value={query} onChange={e => setQuery(e.target.value)}/><Button variant="outline" disabled={busy} onClick={() => void perform(async () => { const entries = await window.launcher!.importProfiles(); if (entries) await persist(addProfiles(current, entries)); })}><Upload size={16}/>导入配置</Button><Button variant="outline" disabled={busy || !current.profiles.length} onClick={() => void perform(() => window.launcher!.exportProfiles(current.profiles))}><Download size={16}/>导出全部</Button></div>
    <div className="profiles-grid">{current.profiles.filter(p => (p.name + p.config.exe).toLowerCase().includes(query.toLowerCase())).map(p => <section className={'card profile-card ' + (p.id === settings.activeProfileId ? 'selected-profile' : '')} key={p.id}>
      <div className="profile-title"><FileCode2 size={22}/><ProfileName key={p.name} profile={p} busy={busy} rename={value => void perform(() => persist({ ...current, profiles: current.profiles.map(item => item.id === p.id ? { ...item, name: value } : item) }))}/>{p.id === settings.activeProfileId && <Check size={17}/>}</div>
      <p className="profile-path" title={p.config.exe}>{p.config.exe || '尚未选择 EXE'}</p>
      <div className="profile-tags"><span>OOBE {p.config.deviceRegion.enabled ? p.config.deviceRegion.geoId : '关闭'}</span><span>用户地区 {p.config.geoRegion.enabled ? p.config.geoRegion.geoId : '关闭'}</span><span>{p.config.timezone.enabled ? p.config.timezone.key : '系统时区'}</span></div>
      <div className="profile-actions"><Button disabled={active || busy || !p.config.exe} onClick={() => void perform(() => launch(selectProfile(current, p.id)))}><Rocket size={15}/>启动此配置</Button><Button variant="outline" disabled={busy} onClick={() => void perform(async () => { await persist(selectProfile(current, p.id)); edit(); })}><Pencil size={15}/>编辑环境</Button><Button variant="ghost" aria-label={`复制 ${p.name}`} disabled={busy || current.profiles.length >= 100} onClick={() => void perform(() => create(p))}><Copy size={16}/></Button><Button variant="ghost" aria-label={`删除 ${p.name}`} disabled={busy} onClick={() => setDeleting(deleting === p.id ? null : p.id)}><Trash2 size={16}/></Button></div>
      {deleting === p.id && <div className="delete-profile"><span>删除此配置？目标程序文件不受影响。</span><Button variant="danger" disabled={busy} onClick={() => void perform(async () => { await persist(removeProfile(current, p.id)); setDeleting(null); })}>确认删除配置</Button><Button variant="ghost" onClick={() => setDeleting(null)}>取消</Button></div>}
    </section>)}</div>
    {!current.profiles.length && <div className="empty"><FileCode2 size={36}/><h3>你的应用环境库</h3><p>先在启动页配置环境，再命名保存；也可以导入配置 JSON。</p></div>}
  </>;
}
