"""Regression for the API gaps demonstrated by the supplied reference script."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from compare_reference_support import build_source, run, build_probe

def main():
    exe = build_probe()
    config = {'deviceRegion': {'enabled': True, 'geoId': 122}, 'language': {'enabled': True, 'userUI': 'ja-JP', 'systemUI': 'ja-JP'}, 'locale': {'enabled': True, 'user': 'ja-JP', 'system': 'ja-JP'}, 'timezone': {'enabled': True, 'key': 'Tokyo Standard Time'}}
    result = run(exe, build_source(config))
    assert result['RegGetValueA.DeviceRegion'] == 122
    assert result['RegQueryValueExA.value'] == result['RegQueryValueExA.view32.value'] == 122
    assert result['RegQueryValueExA.lengthStatus'] == 0 and result['RegQueryValueExA.length'] == 4
    assert result['RegQueryValueExA.shortStatus'] == 234 and result['RegQueryValueExA.shortLength'] == 4
    for key in ['GetThreadUILanguage','GetUserDefaultLangID','GetSystemDefaultLangID','GetUserDefaultLCID','GetSystemDefaultLCID','GetThreadLocale']:
        assert result[key] == 0x411, (key, result[key])
    for key in ['GetUserDefaultLocaleName','GetLocaleInfoEx(default, SNAME)','GetLocaleInfoW(default, SNAME)','GetUserPreferredUILanguages']:
        assert result[key] == 'ja-JP', (key, result[key])
    assert result['GetLocaleInfoEx(explicit en-US)'] == 'en-US'
    assert result['preferred.sizeOnly.ok'] and result['preferred.sizeOnly.size'] == 7
    assert not result['preferred.short.ok'] and result['preferred.short.error'] == 122 and result['preferred.short.size'] == 7
    assert result['preferred.exact.ok'] and result['preferred.exact.count'] == 1 and result['preferred.exact.doubleNull'] == 0 and result['preferred.exact.guard'] == 1234
    assert result['preferred.id'] == '0411' and not result['preferred.invalid.ok'] and result['preferred.invalid.error'] == 87
    assert result['GetTimeZoneInformation.bias'] == result['GetTimeZoneInformationForYear.bias'] == -540
    assert result['GetDynamicTimeZoneInformation.key'] == 'Tokyo Standard Time'
    assert result['GetLocalTime.offsetMinutes'] == 540
    assert result['FileTimeToLocalFileTime.deltaTicks'] == 324000000000 and result['FileTime.roundtrip'] == 133800000000000000
    assert result['timezone.structGuard'] == -858993460 and result['timezone.explicitUTC.bias'] == 0
    independent = copy.deepcopy(config)
    independent['language']['systemUI'] = 'en-US'
    independent['locale'] = {'enabled': True, 'user': 'de-DE', 'system': 'en-US'}
    independent['timezone']['enabled'] = False
    mixed = run(exe, build_source(independent))
    baseline = run(exe, "'use strict';")
    assert mixed['GetUserDefaultUILanguage'] == 0x411 and mixed['GetSystemDefaultUILanguage'] == 0x409
    assert mixed['GetUserDefaultLangID'] == mixed['GetUserDefaultLCID'] == 0x407
    assert mixed['GetSystemDefaultLCID'] == 0x409 and mixed['GetUserDefaultLocaleName'] == 'de-DE'
    assert mixed['GetDynamicTimeZoneInformation.key'] == baseline['GetDynamicTimeZoneInformation.key']
    for module in independent.values():
        module['enabled'] = False
    disabled = run(exe, build_source(independent))
    differences = {key: (baseline[key], value) for key, value in disabled.items() if baseline[key] != value}
    assert not differences, differences
    (ROOT / 'artifacts/compatibility/regression.json').write_text(json.dumps({'japan':result, 'independent':mixed, 'disabled':disabled}, ensure_ascii=False, indent=2), encoding='utf-8')
    print('PASS: ANSI registry, extended NLS, preferred-language buffer contract, fixed Tokyo time, FILETIME roundtrip, explicit UTC, independent switches, disabled baseline')

if __name__ == '__main__':
    main()
