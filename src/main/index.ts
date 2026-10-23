import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from 'electron';
import { join, isAbsolute, extname } from 'node:path';
import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { BackendManager } from './backend-manager';
import { defaults, launchSchema, settingsSchema, profileFileSchema, type Settings } from '../shared/types';

let window: BrowserWindow;
let exiting = false;
let saveQueue = Promise.resolve();
// Test runs isolate their configuration from the user's actual settings.
if (process.env.FRL_TEST_USER_DATA && isAbsolute(process.env.FRL_TEST_USER_DATA)) app.setPath('userData', process.env.FRL_TEST_USER_DATA);
const backend = new BackendManager(message => { if (window && !window.isDestroyed()) window.webContents.send('backend:message', message); });
const dev = !app.isPackaged && process.env.FRL_DEV === '1';
const page = dev ? 'http://127.0.0.1:5173/' : pathToFileURL(join(__dirname, '../dist/index.html')).href;
function trusted(event: Electron.IpcMainInvokeEvent) {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame?.url !== page) throw new Error('拒绝未知 IPC 来源');
}
function handle(name: string, fn: (...args: any[]) => unknown) {
  ipcMain.handle(name, (event, ...args) => { trusted(event); return fn(...args); });
}
async function load(): Promise<Settings> {
  try { return settingsSchema.parse(JSON.parse(await readFile(join(app.getPath('userData'), 'settings.json'), 'utf8'))); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(defaults); throw new Error('配置读取失败或版本不受支持；原文件已保留。请备份并修复用户数据目录中的 settings.json'); }
}
app.whenReady().then(async () => {
  window = new BrowserWindow({ width: 1240, height: 860, minWidth: 940, minHeight: 680, title: 'Frida Region Launcher', backgroundColor: '#f4f6fa', autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  handle('settings:load', load);
  handle('profiles:import', async () => {
    const r = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: '程序配置 JSON', extensions: ['json'] }] });
    if (r.canceled) return null;
    if ((await stat(r.filePaths[0])).size > 1_000_000) throw new Error('配置文件超过 1 MB');
    const parsed = profileFileSchema.parse(JSON.parse(await readFile(r.filePaths[0], 'utf8')));
    // Import only data. Never launch programs or preserve IDs that could overwrite existing profiles.
    return parsed.profiles.map(p => ({ ...p, id: randomUUID() }));
  });
  handle('profiles:export', async (profiles: unknown) => {
    const data = profileFileSchema.parse({ format: 'frida-region-profiles', version: 1, profiles });
    if (Buffer.byteLength(JSON.stringify(data, null, 2), 'utf8') > 1_000_000) throw new Error('导出配置超过 1 MB，请减少配置或参数长度');
    const r = await dialog.showSaveDialog(window, { defaultPath: 'frida-region-profiles.json', filters: [{ name: '程序配置 JSON', extensions: ['json'] }] });
    if (r.filePath) await writeFile(r.filePath, JSON.stringify(data, null, 2), 'utf8');
  });
  handle('settings:save', (input: unknown) => {
    const value = settingsSchema.parse(input);
    nativeTheme.themeSource = value.theme;
    const save = async () => {
      const directory = app.getPath('userData'); await mkdir(directory, { recursive: true });
      const path = join(directory, 'settings.json');
      try {
        const previous = await readFile(path, 'utf8');
        if (JSON.parse(previous).version === 1) {
          try { await writeFile(join(directory, 'settings.v1.backup.json'), previous, { encoding: 'utf8', flag: 'wx' }); }
          catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
        }
      } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      await writeFile(path + '.tmp', JSON.stringify(value, null, 2), 'utf8'); await rename(path + '.tmp', path);
    };
    saveQueue = saveQueue.catch(() => {}).then(save); return saveQueue;
  });
  handle('file:font', async () => { const r = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: '字体文件', extensions: ['ttf', 'otf', 'ttc'] }] }); return r.canceled ? null : r.filePaths[0]; });
  handle('file:exe', async () => { const r = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: 'Windows 应用程序', extensions: ['exe'] }] }); return r.canceled ? null : r.filePaths[0]; });
  handle('file:directory', async () => { const r = await dialog.showOpenDialog(window, { properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; });
  handle('file:icon', async (path: unknown) => { if (typeof path !== 'string' || !isAbsolute(path) || extname(path).toLowerCase() !== '.exe') return null; try { return (await app.getFileIcon(path, { size: 'large' })).toDataURL(); } catch { return null; } });
  handle('backend:command', async (command: unknown, payload: unknown) => {
    if (!['launch','stop','detach','get_status'].includes(command as string)) throw new Error('未知命令');
    if (command === 'launch') {
      payload = launchSchema.parse(payload); const config = payload as ReturnType<typeof launchSchema.parse>;
      if (!isAbsolute(config.exe) || extname(config.exe).toLowerCase() !== '.exe' || !(await stat(config.exe)).isFile()) throw new Error('请选择有效的 EXE 绝对路径');
    }
    return backend.request(command as string, payload);
  });
  handle('logs:export', async (text: unknown) => { if (typeof text !== 'string' || text.length > 5_000_000) throw new Error('日志过大'); const r = await dialog.showSaveDialog(window, { defaultPath: 'frida-region.log', filters: [{ name: '日志', extensions: ['log'] }] }); if (r.filePath) await writeFile(r.filePath, text, 'utf8'); });
  await window.loadURL(page);
});
app.on('before-quit', event => {
  if (exiting) return; event.preventDefault(); exiting = true;
  void Promise.all([backend.shutdown(), saveQueue]).finally(() => app.quit());
});
app.on('window-all-closed', () => app.quit());
