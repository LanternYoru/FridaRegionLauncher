"""Smoke-test the bundled backend with a PATH that excludes development tools."""
import json
import os
from pathlib import Path
import subprocess
ROOT = Path(__file__).resolve().parents[1]
backend = ROOT / 'release' / 'win-unpacked' / 'resources' / 'backend' / 'frl-backend.exe'
assert backend.is_file(), backend
request = json.dumps({'type': 'request', 'requestId': 'package-smoke', 'command': 'shutdown'}) + '\n'
result = subprocess.run([str(backend)], input=request, text=True, encoding='utf-8', capture_output=True, timeout=20, env={'SystemRoot': os.environ['SystemRoot'], 'WINDIR': os.environ['WINDIR'], 'PATH': os.path.join(os.environ['SystemRoot'], 'System32'), 'TEMP': os.environ['TEMP'], 'TMP': os.environ['TEMP']})
assert result.returncode == 0, result.stderr
messages = [json.loads(line) for line in result.stdout.splitlines()]
assert any(m.get('event') == 'backend_ready' for m in messages), messages
assert any(m.get('requestId') == 'package-smoke' and not m.get('error') for m in messages), messages
print('PASS: bundled backend starts without Python, Node or Frida on PATH')
