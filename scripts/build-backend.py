from pathlib import Path
import subprocess
import sys
root = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, '-m', 'PyInstaller', '--noconfirm', '--distpath', str(root / 'build' / 'backend'), '--workpath', str(root / 'build' / 'pyinstaller'), str(root / 'backend' / 'backend.spec')], check=True)
