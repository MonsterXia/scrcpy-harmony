import runpy
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


class NoticesTests(unittest.TestCase):
    def test_unicode_licenses_are_utf8_under_windows_default_encoding(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            license_file = root / 'LICENSE'
            license_file.write_text('版权所有 café \ufffd\n', encoding='utf-8')
            output = root / 'NOTICES.txt'
            distribution = SimpleNamespace(
                metadata={'Name': 'fixture', 'License': 'MIT'}, version='1',
                files=['LICENSE'], locate_file=lambda _: license_file)
            original_open = Path.open

            def windows_open(path, mode='r', buffering=-1, encoding=None,
                             errors=None, newline=None):
                if 'b' not in mode and encoding in (None, 'locale'):
                    encoding = 'cp1252'
                return original_open(path, mode, buffering, encoding, errors, newline)

            with patch('importlib.metadata.distributions', return_value=[distribution]), \
                 patch.object(sys, 'argv', ['notices.py', str(output)]), \
                 patch.object(sys, 'base_prefix', str(root)), \
                 patch.object(Path, 'open', windows_open):
                runpy.run_path(str(Path(__file__).with_name('notices.py')))
            self.assertIn('版权所有 café \ufffd\n', output.read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
