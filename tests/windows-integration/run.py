"""Real Windows x64 Frida tests. No registry writes and no target modifications."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import threading
import time
import winreg

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from frida_manager import FridaManager

EXE = ROOT / 'artifacts' / '中文 空格' / 'RegionProbe.exe'
ARGS = ['空格 参数', 'quote"inside', 'C:\\尾部\\', '']
CONFIG = {'exe': str(EXE), 'args': subprocess.list2cmdline(ARGS), 'cwd': str(ROOT), 'deviceRegion': {'enabled': True, 'geoId': 94}, 'language': {'enabled': True, 'userUI': 'ja-JP', 'systemUI': 'en-US'}, 'locale': {'enabled': True, 'user': 'de-DE', 'system': 'en-US'}}

def registry_snapshot():
    values = []
    for view in [winreg.KEY_WOW64_64KEY, winreg.KEY_WOW64_32KEY]:
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\Microsoft\Windows\CurrentVersion\Control Panel\DeviceRegion', 0, winreg.KEY_READ | view) as key:
                values.append(winreg.QueryValueEx(key, 'DeviceRegion'))
        except OSError as error:
            values.append(('error', error.winerror))
    return values

def run_hooked(config):
    events, output = [], bytearray()
    ended = threading.Event()
    def emit(event, **kwargs):
        events.append((event, kwargs))
        if event in ('process_exited', 'detached'):
            ended.set()
    manager = FridaManager(emit)
    def on_output(pid, fd, data):
        if fd == 1:
            output.extend(data)
    manager.device.on('output', on_output)
    try:
        manager.launch(config)
        if not ended.wait(20):
            manager.stop()
            raise AssertionError('Probe did not exit')
        time.sleep(.2)
        errors = [value for event, value in events if event == 'error']
        assert not errors, errors
        assert manager.pid is None, 'Session cleanup failed'
        return json.loads(output.decode('utf-8-sig').strip()), events
    finally:
        manager.detach()
        manager.device.off('output', on_output)

def main():
    subprocess.run([sys.executable, str(ROOT / 'scripts' / 'build-probe.py')], check=True)
    digest = hashlib.sha256(EXE.read_bytes()).hexdigest()
    before = registry_snapshot()
    baseline = json.loads(subprocess.check_output([str(EXE), *ARGS], cwd=ROOT).decode('utf-8-sig'))
    simulated, events = run_hooked(CONFIG)
    assert simulated['args'] == ARGS, simulated['args']
    assert Path(simulated['cwd']) == ROOT
    for view in ['view64', 'view32']:
        value = simulated[view]
        assert value['open'] == 0, value
        assert value['length']['status'] == 0 and value['length']['size'] == 4
        assert value['short']['status'] == 234 and value['short']['size'] == 4
        assert value['exact']['value'] == 94 and value['exact']['type'] == 4 and value['exact']['status'] == 0
        assert value['large']['value'] == 94 and value['large']['guard'] == -858993460
        assert value['unrelated']['status'] == 2
        assert value['nullBoth'] == 0 and value['nullSize'] == 87
    assert simulated['get']['value'] == 94 and simulated['get']['status'] == 0
    assert simulated['getLength']['size'] == 4
    assert simulated['getShortZero']['status'] == 234 and simulated['getShortZero']['first'] == 0
    assert simulated['wrongType']['status'] == 1630
    assert simulated['invalidFlags']['status'] == 87
    assert simulated['relative']['value'] == 94
    assert simulated['dotnet'] == 94
    assert simulated['userUI'] == 0x411 and simulated['systemUI'] == 0x409
    assert simulated['userLocale'] == 'de-DE' and simulated['systemLocale'] == 'en-US'
    assert simulated['localeShort'] == 0 and simulated['localeShortError'] == 122
    for key in ['unrelatedProductName', 'userGeo', 'timezoneBias', 'timezoneStatus']:
        assert simulated[key] == baseline[key], (key, simulated[key], baseline[key])
    assert any(event == 'hook_event' for event, _ in events), 'No real hook logs'
    disabled = json.loads(json.dumps(CONFIG))
    for key in ['deviceRegion', 'language', 'locale']:
        disabled[key]['enabled'] = False
    unhooked, disabled_events = run_hooked(disabled)
    assert unhooked == baseline, (unhooked, baseline)
    assert not any(event == 'hook_event' for event, _ in disabled_events)
    assert registry_snapshot() == before, 'Real registry changed'
    assert hashlib.sha256(EXE.read_bytes()).hexdigest() == digest, 'Target EXE changed'
    report = {'baseline': baseline, 'simulated': simulated, 'disabled': unhooked, 'registryBeforeAfter': before, 'targetSha256': digest, 'events': events}
    (ROOT / 'artifacts' / 'integration-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('PASS: native + .NET DeviceRegion, buffer contracts, both views, language, args, Unicode paths, cwd, real hook logs, cleanup, unchanged EXE and registry.')

if __name__ == '__main__':
    main()
