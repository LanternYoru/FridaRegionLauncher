'use strict';
const installed = [];
const retained = [];
let pending = [], dropped = 0;
let firstHit = true;
function record(api, original, simulated, status = 0) {
  if (pending.length < 100) pending.push({ timestamp: new Date().toISOString(), level: 'HOOK', source: 'frida', api, original, simulated, status });
  else dropped++;
  // Short-lived targets must still report at least their first actual API hit.
  if (firstHit) { firstHit = false; flush(); }
}
function flush() {
  if (pending.length || dropped) { send({ kind: 'hook_batch', events: pending, dropped }); pending = []; dropped = 0; }
}
setInterval(flush, 100);
function address(module, name) { return Process.getModuleByName(module).getExportByName(name); }
function attachWin32(name, callbacks) {
  const location = Process.getModuleByName('kernel32.dll').findExportByName(name) || Process.getModuleByName('kernelbase.dll').getExportByName(name);
  retained.push(Interceptor.attach(location, callbacks)); installed.push(name);
}
function replace(module, name, result, args, factory) {
  const location = address(module, name);
  const original = new NativeFunction(location, result, args);
  const callback = new NativeCallback(factory(original), result, args);
  retained.push(callback, original);
  Interceptor.replace(location, callback);
  installed.push(name);
}
rpc.exports = {
  initialize() {
    if (installed.length) throw new Error('Hooks already initialized');
    if (Process.arch !== 'x64' || Process.platform !== 'windows') throw new Error('Windows x64 required');
    if (CONFIG.deviceRegion.enabled) installDeviceRegion();
    installLanguage();
    if (CONFIG.timezone && CONFIG.timezone.enabled) installTimezone();
    Interceptor.flush();
    return { hookCount: installed.length, apis: installed, actualHit: false };
  },
  flush
};
