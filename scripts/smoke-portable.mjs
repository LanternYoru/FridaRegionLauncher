// NSIS does not forward the inspector stderr expected by Playwright's Electron
// adapter. Attach to the extracted app's loopback CDP endpoint instead.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const targetIndex = process.argv.indexOf('--target');
const textModules = process.argv.includes('--text');
const targetExe = targetIndex >= 0 ? resolve(process.argv[targetIndex + 1]) : null;
const probe = textModules ? resolve('artifacts/compatibility/TextProbe.exe') : resolve('artifacts/中文 空格/RegionProbe.exe');
await access(targetExe || probe);
const server = createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const environment = { ...process.env, FRL_TEST_USER_DATA: resolve(textModules ? 'artifacts/portable-text-user-data' : 'artifacts/portable-user-data'), PATH: resolve(process.env.SystemRoot, 'System32') };
for (const name of ['PYTHONHOME','PYTHONPATH','VIRTUAL_ENV','NODE_PATH']) delete environment[name];
const child = spawn(resolve(`release/FridaRegionLauncher-Windows-x64-Portable-${version}.exe`), [`--remote-debugging-port=${port}`], { env: environment, windowsHide: true, stdio: 'ignore' });
let browser;
try {
  const deadline = Date.now() + 45000;
  while (true) {
    try { const response = await fetch(`http://127.0.0.1:${port}/json/version`); if (response.ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Portable app startup timed out');
    await delay(200);
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.waitForEvent('page');
  await page.getByRole('heading', { name: '在不同地区，自由运行。' }).waitFor();
  await page.evaluate(() => { window.__testMessages = []; window.launcher.onMessage(message => window.__testMessages.push(message)); });
  await page.getByRole('textbox', { name: '程序路径' }).fill(targetExe || probe);
  await page.getByRole('button', { name: '应用日本兼容预设', exact: true }).click();
  if (textModules) {
    await page.getByRole('textbox', { name: '替换字体名称' }).fill('Consolas');
    await page.getByRole('textbox', { name: '私有字体路径' }).fill(resolve(process.env.WINDIR, 'Fonts/consola.ttf'));
    for (const name of ['启用字符集转换', '启用字体注入']) {
      const toggle = page.getByRole('switch', { name });
      if (await toggle.getAttribute('aria-checked') !== 'true') await toggle.click();
    }
  }
  await page.getByRole('button', { name: '启动程序', exact: true }).last().click();
  if (!targetExe) await page.getByText('程序已退出', { exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: /运行日志/ }).first().click();
  await page.getByText(textModules ? 'MultiByteToWideChar' : targetExe ? 'GetSystemDefaultLCID' : 'RegQueryValueExW', { exact: true }).first().waitFor({ timeout: 20000 });
  if (textModules) {
    await page.getByText('CreateFontIndirectW', { exact: true }).first().waitFor();
    await page.getByText(/私有字体已加载/).first().waitFor();
  }
  assert.equal(await page.locator('.log-level.ERROR').count(), 0);
  if (targetExe) {
    const messages = await page.evaluate(() => window.__testMessages);
    const hooks = messages.filter(m => m.event === 'hook_event').flatMap(m => m.payload.events);
    assert.ok(hooks.some(e => e.api === 'GetSystemDefaultLCID' && e.simulated === 1041));
    assert.ok(hooks.some(e => e.api === 'GetTimeZoneInformation' && e.simulated === -540));
    const { writeFile } = await import('node:fs/promises');
    await writeFile('artifacts/compatibility/portable-target.json', JSON.stringify(messages, null, 2));
    await page.evaluate(() => window.launcher.command('stop'));
  }
  await page.screenshot({ path: textModules ? 'artifacts/ui-portable-text.png' : targetExe ? 'artifacts/ui-portable-target.png' : 'artifacts/ui-portable.png', fullPage: true });
  await page.close();
  console.log(`PASS: final portable EXE self-extraction, GUI, bundled Frida launch and real HOOK logs with system-only PATH (${targetExe ? 'user target: LCID=1041, timezone bias=-540' : 'native probe'})`);
} finally {
  // Close the actual Electron windows even when an assertion fails. CDP
  // disconnect alone leaves the app alive and Chromium cache files locked.
  if (browser) for (const context of browser.contexts()) for (const page of context.pages()) await page.close().catch(() => {});
  await browser?.close();
  // Close the test-owned wrapper if its normal shutdown has not finished.
  if (child.exitCode === null) { await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(5000)]); if (child.exitCode === null) child.kill(); }
}
