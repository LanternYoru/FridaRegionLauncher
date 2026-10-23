"""Compare a user-selected reference script with the shipped hooks on our probe.
Never starts the user's actual application or changes Windows settings.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
import frida

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from config import LOCALES

def run(exe, source):
    device = frida.get_local_device()
    output, messages = bytearray(), []
    finished = threading.Event()
    pid = session = None
    def receive_output(p, fd, data):
        if p == pid and fd == 1:
            output.extend(data)
    device.on('output', receive_output)
    try:
        pid = device.spawn([str(exe)], cwd=str(ROOT), stdio='pipe')
        session = device.attach(pid)
        session.on('detached', lambda *args: finished.set())
        script = session.create_script(source)
        script.on('message', lambda message, data: messages.append(message))
        script.load()
        if 'rpc.exports' in source:
            script.exports_sync.initialize()
        device.resume(pid)
        if not finished.wait(15):
            raise TimeoutError('Comparison probe did not exit')
        time.sleep(.1)
        errors = [m for m in messages if m.get('type') == 'error']
        if errors:
            raise RuntimeError(errors)
        return json.loads(output.decode('utf-8-sig').strip())
    finally:
        device.off('output', receive_output)
        if session is not None and not session.is_detached:
            device.kill(pid)
            session.detach()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('reference', type=Path)
    args = parser.parse_args()
    out = ROOT / 'artifacts' / 'compatibility'
    out.mkdir(parents=True, exist_ok=True)
    exe = out / 'CompatibilityProbe.exe'
    compiler = Path(os.environ['WINDIR']) / 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    subprocess.run([str(compiler), '/nologo', '/platform:x64', '/reference:System.Web.Extensions.dll', '/out:' + str(exe), str(ROOT / 'tests/windows-integration/CompatibilityProbe.cs')], check=True)
    config = {'exe': str(exe), 'cwd': str(ROOT), 'args': '', 'deviceRegion': {'enabled': True, 'geoId': 122}, 'language': {'enabled': True, 'userUI': 'ja-JP', 'systemUI': 'ja-JP'}, 'locale': {'enabled': True, 'user': 'ja-JP', 'system': 'ja-JP'}}
    config['timezone'] = {'enabled': True, 'key': 'Tokyo Standard Time'}
    source = 'const CONFIG=' + json.dumps(config) + ';\nconst LANGIDS=' + json.dumps(LOCALES) + ';\n'
    source += '\n'.join((ROOT / 'backend/hooks' / name).read_text(encoding='utf-8') for name in ['runtime.js','device_region.js','language.js','timezone.js','geo_region.js'])
    result = {'baseline': run(exe, "'use strict';"), 'launcher': run(exe, source), 'reference': run(exe, args.reference.read_text(encoding='utf-8-sig'))}
    result['differences'] = {key: {'launcher': result['launcher'][key], 'reference': value} for key, value in result['reference'].items() if result['launcher'][key] != value}
    (out / 'comparison.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
