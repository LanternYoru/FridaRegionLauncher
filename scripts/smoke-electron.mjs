import { _electron as electron } from 'playwright';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
const packaged = process.argv.includes('--packaged');
await access(resolve('artifacts/中文 空格/RegionProbe.exe'));
await mkdir('artifacts', { recursive: true });
const options = packaged ? { executablePath: resolve('release/win-unpacked/Frida Region Launcher.exe'), args: [] } : { args: ['.'] };
const environment = { ...process.env, FRL_TEST_USER_DATA: resolve('artifacts/ui-user-data') };
if (packaged) {
  environment.PATH = resolve(process.env.SystemRoot, 'System32');
  for (const key of ['PYTHONHOME', 'PYTHONPATH', 'VIRTUAL_ENV', 'NODE_PATH']) delete environment[key];
}
const application = await electron.launch({ ...options, env: environment, timeout: 60000 });
let window;
try {
  window = await application.firstWindow();
  const errors = [];
  window.on('pageerror', error => errors.push(error.message));
  await window.getByRole('heading', { name: '在不同地区，自由运行。' }).waitFor();
  await window.getByRole('button', { name: '保存配置' }).waitFor({ state: 'visible' });
  await window.waitForFunction(() => !!window.launcher);
  await window.evaluate(() => { window.__smokeMessages=[]; window.launcher.onMessage(m => window.__smokeMessages.push(m)); });
  // Start each visual run with the same explicit light theme.
  await window.getByRole('button', { name: '设置', exact: true }).click();
  await window.getByRole('button', { name: '浅色', exact: true }).click();
  await window.getByRole('button', { name: '启动程序', exact: true }).first().click();
  const prefs = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
  assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false); assert.equal(prefs.sandbox, true);
  assert.equal(await window.evaluate(() => typeof window.require), 'undefined');
  const exe = resolve('artifacts/中文 空格/RegionProbe.exe');
  await window.getByRole('textbox', { name: '程序路径' }).fill(exe);
  await window.getByRole('button', { name: '应用日本兼容预设', exact: true }).click();
  await window.getByRole('button', { name: '保存配置' }).click();
  await window.getByRole('status').waitFor();
  await window.screenshot({ path: 'artifacts/ui-light.png', fullPage: true });
  await window.getByRole('button', { name: '启动程序', exact: true }).last().click();
  await window.getByText('程序已退出', { exact: true }).waitFor({ timeout: 20000 });
  await window.getByRole('button', { name: /运行日志/ }).first().click();
  await window.getByText('RegQueryValueExW', { exact: true }).first().waitFor();
  assert.ok(await window.locator('.log-level.HOOK').count() > 0);
  assert.equal(await window.locator('.log-level.ERROR').count(), 0);
  await window.screenshot({ path: 'artifacts/ui-logs.png', fullPage: true });
  await window.getByRole('button', { name: '设置', exact: true }).click();
  await window.getByRole('button', { name: '深色', exact: true }).click();
  await window.getByRole('button', { name: '保存设置', exact: true }).click();
  await window.getByRole('button', { name: '启动程序', exact: true }).first().click();
  await window.screenshot({ path: 'artifacts/ui-dark.png', fullPage: true });
  const saved = await window.evaluate(() => window.launcher.load());
  assert.equal(saved.profile.exe, exe); assert.equal(saved.theme, 'dark');
  assert.equal(saved.profile.deviceRegion.geoId, 122); assert.equal(saved.profile.timezone.enabled, true);
  assert.equal(saved.profile.language.userUI, 'ja-JP'); assert.equal(saved.profile.locale.user, 'ja-JP');
  assert.deepEqual(errors, []);
  console.log(`PASS: ${packaged ? 'packaged' : 'development'} Electron UI, sandbox, saved configuration, real launch IPC and HOOK logs, light/dark screenshots`);
} catch (error) {
  if (window) {
    await writeFile(`artifacts/smoke-electron-${packaged?'packaged':'dev'}-failure.json`, JSON.stringify({ error:String(error), messages:await window.evaluate(()=>window.__smokeMessages || []), text:await window.locator('body').innerText() }, null, 2));
    await window.screenshot({path:`artifacts/smoke-electron-${packaged?'packaged':'dev'}-failure.png`,fullPage:true});
  }
  throw error;
} finally { await application.close(); }
