import os
from pathlib import Path
import subprocess
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
from process_manager import StartupGuard

@unittest.skipUnless(os.name == 'nt', 'Windows process handles required')
class GuardianTests(unittest.TestCase):
    def target(self):
        process = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'], creationflags=subprocess.CREATE_NO_WINDOW)
        def cleanup():
            if process.poll() is None:
                process.kill()
            process.wait(timeout=5)
        self.addCleanup(cleanup)
        return process
    def test_eof_kills_exact_owned_process(self):
        process = self.target()
        guard = StartupGuard(process.pid)
        guard.abort()
        self.assertIsNotNone(process.wait(timeout=5))
    def test_release_keeps_target_alive(self):
        process = self.target()
        guard = StartupGuard(process.pid)
        guard.release()
        self.assertIsNone(process.poll())
