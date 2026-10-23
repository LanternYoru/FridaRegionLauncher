import { Languages, Type, FolderOpen } from 'lucide-react';
import { Button, Switch } from './ui';
import { codePages, type LaunchConfig } from '../../shared/types';

const labels: Record<number, string> = { 932: '日文 · CP932', 936: '简体中文 · GBK', 949: '韩文 · CP949', 950: '繁体中文 · Big5', 1252: '西欧 · Windows-1252', 437: 'OEM 美国 · CP437', 850: 'OEM 西欧 · CP850', 65001: 'Unicode · UTF-8' };
export function TextModules({ config, update, fail }: { config: LaunchConfig; update: (patch: Partial<LaunchConfig>) => void; fail: (error: unknown) => void }) {
  const encoding = config.encoding, font = config.font;
  return <div className="text-modules">
    <section className="card">
      <div className="module-heading"><div className="module-icon teal"><Languages size={20}/></div><div><h3>字符集 / 代码页</h3><p>为传统应用模拟默认编码，与语言和区域格式独立</p></div><Switch aria-label="启用字符集转换" checked={encoding.enabled} onCheckedChange={enabled => update({ encoding: { ...encoding, enabled } })}/></div>
      <div className="module-body"><div className="two-fields">{(['ansi', 'oem'] as const).map(key => <label className="field" key={key}><span>{key === 'ansi' ? 'ANSI / 线程默认代码页' : 'OEM 默认代码页'}</span><select aria-label={key === 'ansi' ? 'ANSI 代码页' : 'OEM 代码页'} value={encoding[key]} onChange={e => update({ encoding: { ...encoding, [key]: Number(e.target.value) } })}>{codePages.map(cp => <option key={cp} value={cp}>{labels[cp]} · {cp}</option>)}</select></label>)}</div><p className="muted text-help">转换使用所选默认代码页；应用显式指定的 UTF-8 等编码保持原样。不会转换磁盘上的文件。</p></div>
    </section>
    <section className="card">
      <div className="module-heading"><div className="module-icon purple"><Type size={20}/></div><div><h3>字体注入 / 替换</h3><p>私有字体仅供目标进程使用；替换作用于 GDI 字体请求</p></div><Switch aria-label="启用字体注入" checked={font.enabled} onCheckedChange={enabled => update({ font: { ...font, enabled } })}/></div>
      <div className="module-body">
        <div className="two-fields"><label className="field"><span>替换为字体名称</span><input aria-label="替换字体名称" maxLength={31} placeholder="例如 Meiryo（字体名称，非文件名）" value={font.family} onChange={e => update({ font: { ...font, family: e.target.value } })}/></label><label className="field"><span>仅替换指定字体（可选）</span><input aria-label="原字体名称" maxLength={31} placeholder="留空替换所有 GDI 字体请求" value={font.source} onChange={e => update({ font: { ...font, source: e.target.value } })}/></label></div>
        <label className="field text-field"><span>GDI 字体字符集</span><select aria-label="字体字符集" value={font.charset} onChange={e => update({ font: { ...font, charset: Number(e.target.value) } })}>{[[-1, '保留应用请求'], [1, '默认 DEFAULT'], [128, '日文 SHIFTJIS'], [134, '简体中文 GB2312'], [136, '繁体中文 BIG5'], [129, '韩文 HANGUL'], [0, '西文 ANSI'], [255, 'OEM']].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label className="field text-field"><span>私有字体文件（可选 · TTF / OTF / TTC）</span><div className="input-button"><input aria-label="私有字体路径" placeholder="选择字体文件，或留空使用已安装字体" value={font.path} onChange={e => update({ font: { ...font, path: e.target.value } })}/><button type="button" aria-label="浏览字体文件" onClick={async () => { try { const path = await window.launcher?.selectFont(); if (path) update({ font: { ...font, path } }); } catch (error) { fail(error); } }}><FolderOpen size={16}/></button></div></label>
        <p className="muted text-help">只加载字体时可留空替换名称。字体字符集只影响字体匹配，不代替编码转换。DirectWrite、WPF、浏览器和自绘文本不保证使用此替换；不存在的字体名称可能由 Windows 回退。</p>
      </div>
    </section>
  </div>;
}
