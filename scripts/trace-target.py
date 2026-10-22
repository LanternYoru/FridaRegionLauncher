"""Bounded diagnostic launch; only records region API names and region values.
Kills only the process it spawns. Never rewrites the target or registry.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time
import frida

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from config import LOCALES
from process_manager import StartupGuard

TRACE = r'''
const seen = {};
for (const name of ['GetUserDefaultUILanguage','GetSystemDefaultUILanguage','GetThreadUILanguage','GetUserDefaultLangID','GetSystemDefaultLangID','GetUserDefaultLCID','GetSystemDefaultLCID','GetThreadLocale','GetUserDefaultLocaleName','GetSystemDefaultLocaleName','GetUserPreferredUILanguages','GetSystemPreferredUILanguages','GetThreadPreferredUILanguages','GetProcessPreferredUILanguages','GetLocaleInfoEx','GetLocaleInfoW','GetLocaleInfoA','GetTimeZoneInformation','GetDynamicTimeZoneInformation','GetTimeZoneInformationForYear','GetLocalTime']) {
 const location = Process.getModuleByName('kernel32.dll').findExportByName(name) || Process.getModuleByName('kernelbase.dll').findExportByName(name);
 if (location) Interceptor.attach(location, { onEnter(args) { seen[name] = (seen[name] || 0) + 1; if (seen[name] === 1) send({kind:'observed_api', api:name}); } });
}
rpc.exports = { summary() { return seen; } };
'''

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('exe', type=Path)
    parser.add_argument('--reference', type=Path)
    parser.add_argument('--label', default='launcher')
    parser.add_argument('--seconds', type=int, default=15)
    parser.add_argument('--hooks-dir', type=Path, default=ROOT / 'backend/hooks')
    args = parser.parse_args()
    exe = args.exe.resolve(strict=True)
    digest = hashlib.sha256(exe.read_bytes()).hexdigest()
    config = {'exe': str(exe), 'cwd': str(exe.parent), 'args': '', 'deviceRegion': {'enabled': True, 'geoId': 122}, 'language': {'enabled': True, 'userUI': 'ja-JP', 'systemUI': 'ja-JP'}, 'locale': {'enabled': True, 'user': 'ja-JP', 'system': 'ja-JP'}}
    if args.reference:
        source = args.reference.read_text(encoding='utf-8-sig')
    else:
        config['timezone'] = {'enabled': True, 'key': 'Tokyo Standard Time'}
        source = 'const CONFIG=' + json.dumps(config) + ';\nconst LANGIDS=' + json.dumps(LOCALES) + ';\n'
        source += '\n'.join((args.hooks_dir / name).read_text(encoding='utf-8') for name in ['runtime.js','device_region.js','language.js','timezone.js'] if (args.hooks_dir / name).exists())
    device = frida.get_local_device()
    pid = session = guard = None
    events = []
    output = {'label':args.label, 'exe':str(exe), 'sha256Before':digest, 'events':events}
    def message(m, data):
        if len(events) < 2000:
            events.append(m)
    try:
        pid = device.spawn([str(exe)], cwd=str(exe.parent), stdio='pipe')
        guard = StartupGuard(pid)
        session = device.attach(pid)
        hook = session.create_script(source)
        hook.on('message', message)
        hook.load()
        if not args.reference:
            output['initialized'] = hook.exports_sync.initialize()
        trace = session.create_script(TRACE)
        trace.on('message', message)
        trace.load()
        device.resume(pid)
        guard.release(); guard = None
        deadline = time.monotonic() + min(args.seconds, 30)
        while time.monotonic() < deadline and not session.is_detached:
            time.sleep(.2)
        output['exitedEarly'] = session.is_detached
        if not session.is_detached:
            output['calls'] = trace.exports_sync.summary()
            if not args.reference:
                hook.exports_sync.flush()
    finally:
        if guard:
            guard.abort()
        if pid is not None and session is not None and not session.is_detached:
            device.kill(pid)
        if session is not None and not session.is_detached:
            session.detach()
        output['sha256After'] = hashlib.sha256(exe.read_bytes()).hexdigest()
        destination = ROOT / 'artifacts' / 'compatibility' / ('target-' + args.label + '.json')
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
        summary = {key:value for key,value in output.items() if key != 'events'}
        summary['eventsCount'] = len(events)
        summary['errors'] = [m for m in events if m.get('type') == 'error']
        summary['actualHookApis'] = sorted({e['api'] for m in events if m.get('type') == 'send' and m.get('payload', {}).get('kind') == 'hook_batch' for e in m['payload']['events']})
        print(json.dumps(summary, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
