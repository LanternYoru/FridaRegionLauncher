import { _electron as electron } from 'playwright';
import { resolve } from 'node:path';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('artifacts', {recursive:true});
const folder=await mkdtemp(resolve('artifacts/child-ui-'));
const packaged=process.argv.includes('--packaged');
const options=packaged?{executablePath:resolve('release/win-unpacked/Frida Region Launcher.exe'),args:[]}:{args:['.']};
const env={...process.env,FRL_TEST_USER_DATA:resolve(folder,'settings')};
if(packaged){env.PATH=resolve(process.env.SystemRoot,'System32');for(const key of ['PYTHONHOME','PYTHONPATH','VIRTUAL_ENV','NODE_PATH'])delete env[key];}
const app=await electron.launch({...options,env});
try {
 const page=await app.firstWindow();
 await page.getByRole('heading',{name:'在不同地区，自由运行。'}).waitFor();
 await page.getByRole('textbox',{name:'程序路径'}).fill(resolve('artifacts/children/ChildProbe.exe'));
 await page.getByPlaceholder('例如：--profile "我的配置"').fill(`"${folder}" root hold`);
 await page.getByRole('button',{name:'应用日本兼容预设',exact:true}).click();
 assert.equal(await page.getByRole('switch',{name:'启用子进程 Hook'}).getAttribute('aria-checked'),'false');
 await page.getByRole('switch',{name:'启用子进程 Hook'}).click();
 const waitTree=()=>page.waitForFunction(()=>{const rows=[...document.querySelectorAll('.process-row')];return rows.length===2&&rows.every(r=>r.textContent.includes('运行中'));});
 await page.getByRole('button',{name:'启动程序',exact:true}).last().click();
 await waitTree();
 await page.screenshot({path:'artifacts/ui-children.png',fullPage:true});
 await page.getByRole('button',{name:'终止全部进程',exact:true}).click();
 await page.getByText('程序已退出',{exact:true}).waitFor();
 assert.equal(await page.locator('.process-row').count(),0);
 await page.getByRole('button',{name:'启动程序',exact:true}).last().click();
 await waitTree();
 await page.getByRole('button',{name:'停止全部监控',exact:true}).click();
 await page.getByText('已停止监控',{exact:true}).waitFor();
 const status=await page.evaluate(()=>window.launcher.command('get_status'));
 assert.deepEqual(status.payload.processes,[]);
 await writeFile(resolve(folder,'release'),'');
 await page.getByRole('button',{name:/运行日志/}).first().click();
 assert.equal(await page.locator('.log-level.ERROR').count(),0);
 console.log(`PASS: ${packaged?'packaged':'development'} Electron opt-in child gating, separate process rows, group stop, group detach and real hook logs`);
}finally{await writeFile(resolve(folder,'release'),'');await app.close();}
