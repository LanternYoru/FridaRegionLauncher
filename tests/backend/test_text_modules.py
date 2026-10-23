import copy
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
from config import validate_text_modules

class TextValidationTests(unittest.TestCase):
    def test_old_config_and_independent_modules(self):
        validate_text_modules({})
        validate_text_modules({'encoding': {'enabled': True, 'ansi': 932, 'oem': 437}})
        validate_text_modules({'font': {'enabled': True, 'family': '游ゴシック', 'source': '', 'charset': 128, 'path': ''}})

    def test_rejects_invalid_values(self):
        for cp in (True, '932', 0, 3, 99999):
            with self.assertRaises(ValueError): validate_text_modules({'encoding': {'enabled': True, 'ansi': cp, 'oem': 932}})
        font = {'enabled': True, 'family': 'Meiryo', 'source': '', 'charset': -1, 'path': ''}
        for patch in ({'family': 'x'*32}, {'family': 'a\0b'}, {'family': '😀'*16}, {'family': ''}, {'charset': True}, {'charset': 932}, {'path': 'relative.ttf'}, {'path': 'a\0b'}, {'script': 'bad'}):
            value = copy.deepcopy(font); value.update(patch)
            with self.assertRaises(ValueError): validate_text_modules({'font': value})

    def test_font_file_checked_only_when_enabled(self):
        with tempfile.TemporaryDirectory() as folder:
            font = {'enabled': True, 'family': '', 'source': '', 'charset': -1, 'path': str(Path(folder)/'test.ttf')}
            with self.assertRaises(ValueError): validate_text_modules({'font': font})
            Path(font['path']).write_bytes(b'not a font')
            # Format validity is checked by GDI in the target before resume.
            validate_text_modules({'font': font})
            font.update(enabled=False, path=str(Path(folder)/'missing.ttf'))
            validate_text_modules({'font': font})

if __name__ == '__main__': unittest.main()
