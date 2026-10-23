import { _electron as electron } from 'playwright';
import { resolve } from 'node:path';
import { mkdtemp, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('artifacts', { recursive: true });
const userData = await mkdtemp(resolve('artifacts/layout-'));
const application = await electron.launch({ args: ['.'], env: { ...process.env, FRL_TEST_USER_DATA: userData } });
try {
  const page = await application.firstWindow();
  await page.getByRole('heading', { name: '用户所在地区' }).waitFor();
  for (const [width, height, zoom] of [[940,680,1], [1240,860,1], [1240,860,1.25]]) {
    await application.evaluate(({ BrowserWindow }, [w,h,z]) => { const win=BrowserWindow.getAllWindows()[0]; win.setSize(w,h); win.webContents.setZoomFactor(z); }, [width,height,zoom]);
    await page.getByRole('heading', { name: '用户所在地区' }).scrollIntoViewIfNeeded();
    const cards = await page.locator('.module-stack .card').evaluateAll(elements => elements.map(card => {
      const rect=card.getBoundingClientRect();
      const bottom=Math.max(...[...card.querySelectorAll('input,select,p,h3')].map(el=>el.getBoundingClientRect().bottom));
      return { title:card.querySelector('h3').textContent, overflow:card.scrollHeight-card.clientHeight, bottom, cardBottom:rect.bottom };
    }));
    for (const card of cards) { assert.ok(card.overflow <= 1, JSON.stringify({width,height,zoom,card})); assert.ok(card.bottom <= card.cardBottom, JSON.stringify(card)); }
    await page.screenshot({path:`artifacts/layout-${width}-${zoom}.png`,fullPage:true});
  }
  console.log('PASS: user region/language/locale content fits cards at minimum/default sizes and 125% zoom');
} finally { await application.close(); }
