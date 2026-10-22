import json
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
from config import parse_arguments
from protocol import parse
from frida_manager import FridaManager

class ProtocolTests(unittest.TestCase):
    def test_request(self):
        self.assertEqual(parse('{"type":"request","requestId":"id","command":"get_status"}')['command'], 'get_status')
    def test_reject_untrusted(self):
        for value in ['{}', '[]', 'hello', '{"type":"event"}']:
            with self.assertRaises((ValueError, json.JSONDecodeError)):
                parse(value)
    def test_windows_arguments(self):
        self.assertEqual(parse_arguments('"中文 空格" "" plain "C:\\path with space\\\\"'), ['中文 空格', '', 'plain', 'C:\\path with space\\'])

class LifecycleTests(unittest.TestCase):
    def setUp(self):
        self.guard = patch('frida_manager.StartupGuard').start()
        self.addCleanup(patch.stopall)
    @patch('frida_manager.validate', return_value=('target.exe', [], 'C:\\'))
    def test_attach_failure_kills_suspended_target(self, _):
        device = Mock(); device.spawn.return_value = 123; device.attach.side_effect = RuntimeError('attach failed')
        manager = FridaManager(Mock(), device)
        with self.assertRaisesRegex(RuntimeError, 'attach failed'):
            manager.launch({})
        device.kill.assert_called_once_with(123)
        device.resume.assert_not_called()
        self.assertIsNone(manager.pid)
    @patch('frida_manager.validate', return_value=('target.exe', [], 'C:\\'))
    def test_script_failure_cleans_session(self, _):
        device = Mock(); device.spawn.return_value = 123
        session = device.attach.return_value
        session.create_script.return_value.load.side_effect = RuntimeError('syntax error')
        manager = FridaManager(Mock(), device)
        with self.assertRaisesRegex(RuntimeError, 'syntax error'):
            manager.launch({})
        device.kill.assert_called_once_with(123); session.detach.assert_called_once(); device.resume.assert_not_called()

if __name__ == '__main__': unittest.main()
