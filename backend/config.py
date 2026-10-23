from pathlib import Path
import ctypes
from ctypes import wintypes
import os

LOCALES = {'en-US': 0x409, 'zh-CN': 0x804, 'zh-TW': 0x404, 'ja-JP': 0x411, 'de-DE': 0x407, 'fr-FR': 0x40c, 'ko-KR': 0x412}

def validate_text_modules(config):
    encoding = config.get('encoding', {'enabled': False, 'ansi': 932, 'oem': 932})
    if not isinstance(encoding, dict) or set(encoding) != {'enabled', 'ansi', 'oem'} or type(encoding['enabled']) is not bool:
        raise ValueError('代码页配置无效')
    for key in ('ansi', 'oem'):
        if type(encoding[key]) is not int or encoding[key] not in (932, 936, 949, 950, 1252, 437, 850, 65001):
            raise ValueError('不支持的代码页')
    font = config.get('font', {'enabled': False, 'family': '', 'source': '', 'charset': -1, 'path': ''})
    if not isinstance(font, dict) or set(font) != {'enabled', 'family', 'source', 'charset', 'path'} or type(font['enabled']) is not bool:
        raise ValueError('字体配置无效')
    for key in ('family', 'source'):
        value = font[key]
        if not isinstance(value, str) or len(value.encode('utf-16-le')) > 62 or any(ord(c) < 32 for c in value) or value != value.strip():
            raise ValueError('字体名称最多 31 个 UTF-16 字符，不能包含控制字符或首尾空格')
    if type(font['charset']) is not int or font['charset'] not in (-1, 0, 1, 128, 129, 134, 136, 255):
        raise ValueError('字体字符集无效')
    if not isinstance(font['path'], str) or '\0' in font['path'] or len(font['path']) > 32767:
        raise ValueError('字体文件路径无效')
    if font['enabled']:
        if not font['family'] and not font['path']:
            raise ValueError('请指定替换字体名称或私有字体文件')
        if font['path']:
            path = Path(font['path'])
            if not path.is_absolute() or not path.is_file() or path.suffix.lower() not in ('.ttf', '.otf', '.ttc'):
                raise ValueError('请选择存在的 TTF、OTF 或 TTC 字体文件（绝对路径）')

def parse_arguments(text):
    if not isinstance(text, str) or len(text) > 30000 or '\0' in text:
        raise ValueError('启动参数无效')
    if not text.strip():
        return []
    shell = ctypes.WinDLL('shell32', use_last_error=True)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    shell.CommandLineToArgvW.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(ctypes.c_int)]
    shell.CommandLineToArgvW.restype = ctypes.POINTER(wintypes.LPWSTR)
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    count = ctypes.c_int()
    # Dummy argv[0] makes all user input use the ordinary Windows argument rules.
    ptr = shell.CommandLineToArgvW('launcher.exe ' + text, ctypes.byref(count))
    if not ptr:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return [ptr[i] for i in range(1, count.value)]
    finally:
        kernel.LocalFree(ptr)

def validate(config):
    required = {'exe', 'args', 'cwd', 'deviceRegion', 'language', 'locale'}
    if not isinstance(config, dict) or not required.issubset(config) or set(config) - required - {'timezone', 'geoRegion', 'children', 'encoding', 'font'}:
        raise ValueError('无效的启动配置')
    validate_text_modules(config)
    if type(config.get('children', False)) is not bool:
        raise ValueError('子进程开关必须是布尔值')
    timezone = config.get('timezone', {'enabled': False, 'key': 'Tokyo Standard Time'})
    if not isinstance(timezone, dict) or set(timezone) != {'enabled', 'key'} or type(timezone['enabled']) is not bool or timezone['key'] not in ('Tokyo Standard Time', 'China Standard Time', 'Pacific Standard Time', 'W. Europe Standard Time', 'UTC'):
        raise ValueError('不支持的 Windows 时区标识符')
    geo_region = config.get('geoRegion', {'enabled': False, 'geoId': 122})
    if not isinstance(geo_region, dict) or set(geo_region) != {'enabled', 'geoId'} or type(geo_region['enabled']) is not bool or type(geo_region['geoId']) is not int or not 1 <= geo_region['geoId'] <= 2147483647:
        raise ValueError('用户地区配置无效')
    for field in ('exe', 'args', 'cwd'):
        if not isinstance(config[field], str) or '\0' in config[field] or len(config[field]) > 32767:
            raise ValueError('路径或参数无效')
    exe = Path(config['exe'])
    if not exe.is_absolute() or exe.suffix.lower() != '.exe' or not exe.is_file():
        raise ValueError('请选择存在的 EXE 文件（绝对路径）')
    # Explicit x64 PE check. Never rewrite the target.
    with exe.open('rb') as stream:
        if stream.read(2) != b'MZ':
            raise ValueError('目标不是 Windows PE 文件')
        stream.seek(0x3c)
        offset = int.from_bytes(stream.read(4), 'little')
        stream.seek(offset)
        if stream.read(6) != b'PE\x00\x00\x64\x86':
            raise ValueError('目前仅支持 Windows x64 EXE')
    cwd = Path(config['cwd']) if config['cwd'] else exe.parent
    if not cwd.is_absolute() or not cwd.is_dir():
        raise ValueError('工作目录不存在或不是绝对路径')
    for name in ('deviceRegion', 'language', 'locale'):
        if not isinstance(config[name], dict) or type(config[name].get('enabled')) is not bool:
            raise ValueError('Hook 开关必须是布尔值')
    geo = config['deviceRegion'].get('geoId')
    if type(geo) is not int or not 1 <= geo <= 2147483647:
        raise ValueError('GeoID 必须是有效的正整数')
    for name, keys in [('language', ['userUI', 'systemUI']), ('locale', ['user', 'system'])]:
        if any(config[name].get(key) not in LOCALES for key in keys):
            raise ValueError('不支持的语言或区域格式')
    return str(exe), parse_arguments(config['args']), str(cwd)
