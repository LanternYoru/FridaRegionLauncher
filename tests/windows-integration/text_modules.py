"""Real Win32 conversion/font contracts, private resource lifecycle and children."""
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from compare_reference_support import build_source, run
sys.path.insert(0, str(ROOT / 'backend'))
from frida_manager import FridaManager

def wait(check, timeout=20):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        value = check()
        if value: return value
        time.sleep(.05)
    raise AssertionError('Text probe timeout')

def main():
    out = ROOT / 'artifacts/compatibility'
    out.mkdir(parents=True, exist_ok=True)
    exe = out / 'TextProbe.exe'
    compiler = Path(os.environ['WINDIR']) / 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    subprocess.run([str(compiler), '/nologo', '/platform:x64', '/reference:System.Web.Extensions.dll', '/out:' + str(exe), str(ROOT / 'tests/windows-integration/TextProbe.cs')], check=True)
    config = {'exe': str(exe), 'args': '', 'cwd': str(ROOT), 'deviceRegion': {'enabled': False, 'geoId': 94}, 'language': {'enabled': False, 'userUI': 'en-US', 'systemUI': 'en-US'}, 'locale': {'enabled': False, 'user': 'en-US', 'system': 'en-US'}, 'encoding': {'enabled': True, 'ansi': 932, 'oem': 437}, 'font': {'enabled': True, 'family': 'Consolas', 'source': 'Arial', 'charset': 128, 'path': ''}}
    baseline = run(exe, "'use strict';")
    digest = hashlib.sha256(exe.read_bytes()).hexdigest()
    evidence = {'baseline': baseline}
    # Compare all results (including failure codes) to explicit native code pages.
    # LastError after success is unspecified, so compare it only after failure.
    for cp in (932, 936, 949, 950, 1252, 437, 850, 65001):
        config['encoding']['ansi'] = cp
        result = run(exe, build_source(config))
        assert result['acp'] == cp and result['oem'] == 437
        for default, explicit in ((0, cp), (3, cp), (1, 437)):
            for suffix in ('size', 'text', 'short', 'guard', 'invalid', 'wideSize', 'bytes', 'wideShort', 'max', 'infoW', 'infoA', 'lead'):
                assert result[f'{default}.{suffix}'] == baseline[f'{explicit}.{suffix}'], (cp, default, suffix, result)
            for call, error in (('short', 'shortError'), ('invalid', 'invalidError'), ('wideShort', 'wideError')):
                if result[f'{default}.{call}'] == 0:
                    assert result[f'{default}.{error}'] == baseline[f'{explicit}.{error}']
        assert result['lead'] == baseline[f'{cp}.lead']
        for explicit in (932, 936, 65001):
            for suffix in ('text', 'bytes', 'size', 'wideSize'):
                assert result[f'{explicit}.{suffix}'] == baseline[f'{explicit}.{suffix}']
        for kind in ('indirectW', 'indirectA', 'indirectExW', 'indirectExA', 'directW', 'directA'):
            assert result['Arial.' + kind][:4] == ['Consolas', 128, -21, 700], (kind, result)
            assert result['Courier New.' + kind] == baseline['Courier New.' + kind]
        for kind in ('W', 'A', 'ExW', 'ExA'): assert result['Arial.input' + kind] == 'Arial'
        evidence[str(cp)] = result
    config['encoding']['ansi'] = 932
    config['font']['source'] = ''
    config['font']['charset'] = -1
    all_fonts = run(exe, build_source(config))
    assert all_fonts['Courier New.directA'][:4] == ['Consolas', 1, -21, 700]
    assert all_fonts['Arial.directW'][4] == 'Consolas', all_fonts['Arial.directW']
    config['font']['enabled'] = False
    encoding_only = run(exe, build_source(config))
    assert encoding_only['acp'] == 932 and encoding_only['Arial.directW'] == baseline['Arial.directW']
    config['font']['enabled'] = True
    config['encoding']['enabled'] = False
    font_only = run(exe, build_source(config))
    assert font_only['acp'] == baseline['acp'] and font_only['Arial.directA'][0] == 'Consolas'
    config['encoding']['enabled'] = True
    # Existing system file is loaded privately; no font files are distributed.
    font_path = Path(os.environ['WINDIR']) / 'Fonts/consola.ttf'
    assert font_path.is_file()
    font_digest = hashlib.sha256(font_path.read_bytes()).hexdigest()
    config['font']['path'] = str(font_path)
    folder = Path(tempfile.mkdtemp(prefix='text-', dir=out))
    config['args'] = subprocess.list2cmdline([str(folder)])
    config['children'] = True
    events = []
    manager = FridaManager(lambda event, **data: events.append({'event': event, **data}))
    try:
        manager.launch(config)
        wait(lambda: (folder / 'child-first.json').exists())
        for role in ('root', 'child'):
            first = json.loads((folder / f'{role}-first.json').read_text(encoding='utf-8'))
            assert first['acp'] == 932 and first['Arial.directW'][0] == 'Consolas'
        # cleanup is idempotent and private references really disappear.
        for context in list(manager.processes.values()):
            script = context['session'].create_script("rpc.exports.remove = function(path) { const g=Module.load('gdi32.dll'); return new NativeFunction(g.getExportByName('RemoveFontResourceExW'),'int',['pointer','uint','pointer'])(Memory.allocUtf16String(path),16,ptr(0)); };")
            script.load()
            context['script'].exports_sync.cleanup()
            context['script'].exports_sync.cleanup()
            assert script.exports_sync.remove(str(font_path)) == 0, 'private reference leaked'
            script.unload()
        manager.detach()
        (folder / 'sample').touch()
        wait(lambda: (folder / 'child-after.json').exists() and (folder / 'root-after.json').exists())
        for role in ('root', 'child'):
            after = json.loads((folder / f'{role}-after.json').read_text(encoding='utf-8'))
            assert after['acp'] == baseline['acp'] and after['Arial.directW'] == baseline['Arial.directW']
        assert not any(e.get('error') for e in events), events
        assert len([e for e in events if e['event'] == 'font_resource' and '已加载' in e['payload']['text']]) == 2
    finally:
        (folder / 'release').touch()
        manager.stop()
        manager.device.off('child-added', manager._child_added)
    evidence['lifecycle'] = events
    # Loading alone must not replace the application's requested family.
    config['font']['family'] = ''
    load_only = run(exe, build_source(config))
    assert load_only['Arial.directA'] == baseline['Arial.directA']
    bad_font = folder / 'invalid.ttf'
    bad_font.write_bytes(b'not a font')
    config['font']['path'] = str(bad_font)
    failed_events = []
    failed = FridaManager(lambda event, **data: failed_events.append({'event': event, **data}))
    try:
        try: failed.launch(config)
        except Exception as error: assert '私有字体加载失败' in str(error), error
        else: raise AssertionError('Invalid font resumed the target')
        assert not failed.status()['processes']
        assert not any(e['event'] == 'process_resumed' for e in failed_events)
    finally:
        failed.stop()
        failed.device.off('child-added', failed._child_added)
    config['encoding']['enabled'] = config['font']['enabled'] = False
    disabled = run(exe, build_source(config))
    for key in baseline:
        if not key.endswith('Error'): assert disabled[key] == baseline[key], key
    assert hashlib.sha256(exe.read_bytes()).hexdigest() == digest
    assert hashlib.sha256(font_path.read_bytes()).hexdigest() == font_digest
    (out / 'text-modules.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
    print('PASS: 8 code pages, ANSI/OEM/thread conversion, errors/buffers, explicit encodings, six GDI A/W APIs, font matching, untouched inputs, private load/cleanup, children and detach')

if __name__ == '__main__': main()
