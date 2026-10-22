from pathlib import Path
import os
import subprocess
ROOT = Path(__file__).resolve().parents[1]
directory = ROOT / 'artifacts' / '中文 空格'
directory.mkdir(parents=True, exist_ok=True)
compiler = Path(os.environ['WINDIR']) / 'Microsoft.NET' / 'Framework64' / 'v4.0.30319' / 'csc.exe'
subprocess.run([str(compiler), '/nologo', '/platform:x64', '/target:exe', '/reference:System.Web.Extensions.dll', '/out:' + str(directory / 'RegionProbe.exe'), str(ROOT / 'tests' / 'windows-integration' / 'RegionProbe.cs')], check=True)
