// NSIS does not forward the inspector stderr expected by Playwright's Electron
// adapter. Attach to the extracted app's loopback CDP endpoint instead.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const targetIndex = process.argv.indexOf('--target');
const targetExe = targetIndex >= 0 ? resolve(process.argv[targetIndex + 1]) : null;
const server = createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const environment = { ...process.env, FRL_TEST_USER_DATA: resolve('artifacts/portable-user-data'), PATH: resolve(process.env.SystemRoot, 'System32') };
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
  await page.getByRole('textbox', { name: '程序路径' }).fill(targetExe || resolve('artifacts/中文 空格/RegionProbe.exe'));
  await page.getByRole('button', { name: '应用日本兼容预设', exact: true }).click();
  await page.getByRole('button', { name: '启动程序', exact: true }).last().click();
  if (!targetExe) await page.getByText('程序已退出', { exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: /运行日志/ }).first().click();
  await page.getByText(targetExe ? 'GetSystemDefaultLCID' : 'RegQueryValueExW', { exact: true }).first().waitFor({ timeout: 20000 });
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
  await page.screenshot({ path: targetExe ? 'artifacts/ui-portable-target.png' : 'artifacts/ui-portable.png', fullPage: true });
  await page.close();
  console.log(`PASS: final portable EXE self-extraction, GUI, bundled Frida launch and real HOOK logs with system-only PATH (${targetExe ? 'user target: LCID=1041, timezone bias=-540' : 'native probe'})`);
} finally {
  await browser?.close();
  // Close the test-owned wrapper if its normal shutdown has not finished.
  if (child.exitCode === null) { await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(5000)]); if (child.exitCode === null) child.kill(); }
}
