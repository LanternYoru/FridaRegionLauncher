"""Separate initialization guardian. Owns an inherited HANDLE, not a reusable PID.

Backend EOF/crash or a 25s startup timeout terminates only the spawned target.
After successful resume the guardian is released; later detach preserves the app.
"""
import ctypes
from ctypes import wintypes
import os
from pathlib import Path
import subprocess
import sys
import threading

def kernel():
    api = ctypes.WinDLL('kernel32', use_last_error=True)
    api.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    api.OpenProcess.restype = wintypes.HANDLE
    api.TerminateProcess.argtypes = [wintypes.HANDLE, wintypes.UINT]
    api.CloseHandle.argtypes = [wintypes.HANDLE]
    return api

def guardian_main(handle):
    api = kernel()
    def terminate():
        api.TerminateProcess(handle, 1)
        os._exit(1)
    timer = threading.Timer(25, terminate)
    timer.daemon = True
    timer.start()
    try:
        if sys.stdin.readline().strip() != 'release':
            api.TerminateProcess(handle, 1)
    finally:
        timer.cancel()
        api.CloseHandle(handle)

class StartupGuard:
    def __init__(self, pid):
        api = kernel()
        handle = api.OpenProcess(0x100001, True, pid) # SYNCHRONIZE | TERMINATE
        if not handle:
            raise ctypes.WinError(ctypes.get_last_error())
        startup = subprocess.STARTUPINFO()
        startup.lpAttributeList = {'handle_list': [handle]}
        args = [sys.executable]
        if not getattr(sys, 'frozen', False):
            args.append(str(Path(__file__).parent / 'main.py'))
        args.extend(['--guardian', str(handle)])
        try:
            self.process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, close_fds=True, startupinfo=startup, creationflags=subprocess.CREATE_NO_WINDOW)
        finally:
            api.CloseHandle(handle)

    def release(self):
        if self.process.poll() is not None:
            raise RuntimeError('初始化超时，目标已由守护进程清理')
        self.process.stdin.write(b'release\n')
        self.process.stdin.close()
        self.process.wait(timeout=5)

    def abort(self):
        if not self.process.stdin.closed:
            self.process.stdin.close()
        self.process.wait(timeout=5)
