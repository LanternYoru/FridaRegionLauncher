import json
import os
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]

class StdioTests(unittest.TestCase):
    def test_multiple_requests_and_recovery_from_malformed_message(self):
        commands = [{'type': 'request', 'requestId': '中文-status', 'command': 'get_status'}, {'type': 'request', 'requestId': 'exit', 'command': 'shutdown'}]
        result = subprocess.run([sys.executable, str(ROOT / 'backend' / 'main.py')], input='not-json\n' + ''.join(json.dumps(c, ensure_ascii=False) + '\n' for c in commands), capture_output=True, text=True, encoding='utf-8', timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr)
        messages = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual(messages[0]['event'], 'backend_ready')
        self.assertTrue(messages[1]['error'])
        self.assertEqual(messages[2]['requestId'], '中文-status')
        self.assertEqual(messages[2]['payload']['state'], 'idle')
        responses = [m for m in messages if m['type'] == 'response']
        self.assertEqual(responses[-1]['requestId'], 'exit')

if __name__ == '__main__': unittest.main()
