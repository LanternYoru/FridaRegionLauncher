"""Compare simulated defaults to explicit Windows geography and timezone queries."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from compare_reference_support import build_source, run

def main():
    out = ROOT / 'artifacts/compatibility'
    out.mkdir(parents=True, exist_ok=True)
    exe = out / 'GeoTimeProbe.exe'
    compiler = Path(os.environ['WINDIR']) / 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    subprocess.run([str(compiler), '/nologo', '/platform:x64', '/reference:System.Web.Extensions.dll', '/out:' + str(exe), str(ROOT / 'tests/windows-integration/GeoTimeProbe.cs')], check=True)
    config = {'deviceRegion': {'enabled': False, 'geoId': 94}, 'language': {'enabled': False, 'userUI': 'en-US', 'systemUI': 'en-US'}, 'locale': {'enabled': False, 'user': 'en-US', 'system': 'en-US'}, 'geoRegion': {'enabled': True, 'geoId': 122}, 'timezone': {'enabled': True, 'key': 'Tokyo Standard Time'}}
    baseline = run(exe, "'use strict';")
    evidence = {'baseline': baseline}
    for key in ['Tokyo Standard Time','China Standard Time','Pacific Standard Time','W. Europe Standard Time','UTC']:
        config['timezone']['key'] = key
        result = run(exe, build_source(config))
        assert result['geo.id'] == 122 and result['geo.name'] == result['geo.iso2'] == 'JP', result
        assert result['geo.explicitUS'] == 'US'
        assert result['geo.size'] == 3 and result['geo.short.result'] == 0 and result['geo.short.error'] == 122
        assert result['geo.short.guard'] == -858993460
        assert result['geo.null.result'] == 0 and result['geo.null.error'] == 87
        for kind in ['regionClass', 'invalidClass']:
            assert result['geo.' + kind] == baseline['geo.' + kind]
        assert result['zone.key'] == key
        assert result['zone.status'] == result['zone.staticStatus']
        assert result['zone.standardBias'] == result['zone.staticBias']
        for suffix in ['date0','date1','date2','date3','date4','rules2006','rules2026']:
            assert result['current.'+suffix] == baseline[key+'.'+suffix], (key, suffix, result['current.'+suffix], baseline[key+'.'+suffix])
        for name in baseline:
            if any(name.startswith(zone+'.') for zone in ['Tokyo Standard Time','China Standard Time','Pacific Standard Time','W. Europe Standard Time','UTC']):
                assert result[name] == baseline[name], ('Explicit timezone modified', name)
        evidence[key] = result
    assert evidence['Pacific Standard Time']['current.date0'][0] == -480
    assert evidence['Pacific Standard Time']['current.date1'][0] == -420
    assert evidence['Pacific Standard Time']['current.date3'][0] == -480
    assert evidence['Pacific Standard Time']['current.date4'][0] == -420
    config['geoRegion'] = {'enabled': True, 'geoId': 94}
    config['timezone']['enabled'] = False
    mixed = run(exe, build_source(config))
    assert mixed['geo.id'] == 94 and mixed['geo.name'] == 'DE'
    assert mixed['zone.key'] == baseline['zone.key']
    config['geoRegion']['enabled'] = False
    disabled = run(exe, build_source(config))
    assert disabled == baseline
    evidence['disabled'] = disabled
    from frida_manager import FridaManager
    emitted = []
    manager = FridaManager(lambda event, **data: emitted.append((event, data)))
    invalid = copy.deepcopy(config)
    invalid.update(exe=str(exe), args='', cwd=str(ROOT))
    invalid['geoRegion'] = {'enabled': True, 'geoId': 2147483647}
    try:
        manager.launch(invalid)
    except Exception as error:
        assert 'GeoID' in str(error), error
    else:
        manager.stop()
        raise AssertionError('Unknown GeoID unexpectedly accepted')
    assert manager.pid is None and manager.status()['state'] == 'error'
    assert not any(event == 'process_resumed' for event, _ in emitted)
    (out / 'geo-timezone.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
    print('PASS: independent GeoID/GeoName, buffer errors, 5 Windows zones, winter/summer/DST boundary/historical conversions, explicit zones unchanged, disabled baseline')

if __name__ == '__main__': main()
