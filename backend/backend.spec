from pathlib import Path
root = Path(SPECPATH)
a = Analysis([str(root / 'main.py')], pathex=[str(root)], binaries=[], datas=[(str(root / 'hooks'), 'hooks')], hiddenimports=['frida'], hookspath=[], hooksconfig={}, runtime_hooks=[], excludes=[])
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='frl-backend', debug=False, bootloader_ignore_signals=False, strip=False, upx=False, console=True)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='frl-backend')
