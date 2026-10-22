"""Shared mechanics for deterministic x64 compatibility probes."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('reference_runner', ROOT / 'scripts/compare-reference.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
run = runner.run

def build_probe():
    out = ROOT / 'artifacts/compatibility'
    out.mkdir(parents=True, exist_ok=True)
    exe = out / 'CompatibilityProbe.exe'
    compiler = Path(os.environ['WINDIR']) / 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    subprocess.run([str(compiler), '/nologo', '/platform:x64', '/reference:System.Web.Extensions.dll', '/out:' + str(exe), str(ROOT / 'tests/windows-integration/CompatibilityProbe.cs')], check=True)
    return exe

def build_source(config):
    source = 'const CONFIG=' + json.dumps(config) + ';\nconst LANGIDS=' + json.dumps(runner.LOCALES) + ';\n'
    return source + '\n'.join((ROOT / 'backend/hooks' / name).read_text(encoding='utf-8') for name in ['runtime.js','device_region.js','language.js','timezone.js'])
