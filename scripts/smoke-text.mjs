import { _electron as electron } from 'playwright';
import { resolve } from 'node:path';
import { mkdtemp, mkdir, access, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('artifacts', { recursive: true });
const userData = await mkdtemp(resolve('artifacts/text-ui-'));
const exe = resolve('artifacts/compatibility/TextProbe.exe');
await access(exe);
const font = resolve(process.env.WINDIR, 'Fonts/consola.ttf');
const packaged = process.argv.includes('--packaged');
const env = { ...process.env, FRL_TEST_USER_DATA: userData };
if (packaged) { env.PATH = resolve(process.env.SystemRoot, 'System32'); for (const name of ['PYTHONHOME','PYTHONPATH','VIRTUAL_ENV','NODE_PATH']) delete env[name]; }
const options = packaged ? { executablePath: resolve('release/win-unpacked/Frida Region Launcher.exe'), args: [] } : { args: ['.'] };
let app = await electron.launch({ ...options, env });
try {
  let page = await app.firstWindow();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('heading', { name: '字符集 / 代码页' }).waitFor();
  assert.equal(await page.getByRole('switch', { name: '启用字符集转换' }).getAttribute('aria-checked'), 'false');
  await page.getByRole('textbox', { name: '程序路径', exact: true }).fill(exe);
  await page.getByRole('switch', { name: '启用字符集转换' }).click();
  await page.getByRole('combobox', { name: 'ANSI 代码页', exact: true }).selectOption('932');
  await page.getByRole('combobox', { name: 'OEM 代码页', exact: true }).selectOption('437');
  await page.getByRole('textbox', { name: '替换字体名称' }).fill('Consolas');
  await page.getByRole('textbox', { name: '原字体名称' }).fill('Arial');
  await page.getByRole('combobox', { name: '字体字符集' }).selectOption('128');
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, font);
  await page.getByRole('button', { name: '浏览字体文件' }).click();
  await page.getByRole('switch', { name: '启用字体注入' }).click();
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await page.getByRole('status').waitFor();
  const saved = await page.evaluate(() => window.launcher.load());
  assert.deepEqual(saved.profile.encoding, { enabled: true, ansi: 932, oem: 437 });
  assert.equal(saved.profile.font.path, font);
  for (const [width, height, zoom] of [[940,680,1], [1240,860,1.25]]) {
    await app.evaluate(({ BrowserWindow }, [w,h,z]) => { const win=BrowserWindow.getAllWindows()[0]; win.setSize(w,h); win.webContents.setZoomFactor(z); }, [width,height,zoom]);
    await page.getByRole('heading', { name: '字体注入 / 替换' }).scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page overflows horizontally');
    const overflow = await page.locator('.text-modules .card').evaluateAll(cards => cards.map(c => ({ vertical: c.scrollHeight-c.clientHeight, horizontal: c.scrollWidth-c.clientWidth })));
    assert.ok(overflow.every(o => o.vertical<=1 && o.horizontal<=1), JSON.stringify(overflow));
    // Electron's native capture respects setZoomFactor; CDP element clips do not.
    const screenshot = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'));
    await writeFile(`artifacts/text-ui-${packaged?'packaged':'dev'}-${width}-${zoom}.png`, Buffer.from(screenshot, 'base64'));
  }
  await app.close();
  app = await electron.launch({ ...options, env });
  page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('textbox', { name: '替换字体名称' }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: '替换字体名称' }).inputValue(), 'Consolas');
  await page.getByRole('button', { name: '启动程序', exact: true }).last().click();
  await page.getByText('程序已退出', { exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: /运行日志/ }).first().click();
  await page.getByText('GetACP', { exact: true }).first().waitFor();
  await page.getByText('MultiByteToWideChar', { exact: true }).first().waitFor();
  await page.getByText('CreateFontIndirectW', { exact: true }).first().waitFor();
  await page.getByText(/私有字体已加载/).first().waitFor();
  assert.equal(await page.locator('.log-level.ERROR').count(), 0);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `artifacts/text-logs-${packaged?'packaged':'dev'}.png`, fullPage: true });
  console.log('PASS: text modules UI, font picker IPC, independent settings, persistence/restart, min window/125% zoom, actual conversion/font logs' + (packaged ? ' with bundled runtime' : ''));
} finally { await app.close(); }
