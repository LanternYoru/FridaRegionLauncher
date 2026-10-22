import json
from pathlib import Path
import threading
import time
import frida
from config import validate, LOCALES
from process_manager import StartupGuard

class FridaManager:
    def __init__(self, emit, device=None):
        self.emit = emit
        self.device = device or frida.get_local_device()
        self.lock = threading.RLock()
        self.pid = None
        self.session = None
        self.script = None
        self.started = None
        self.state = 'idle'
        self.hook_count = 0
        self.hits = 0

    def status(self):
        with self.lock:
            return {'pid': self.pid, 'state': self.state, 'started': self.started, 'hookCount': self.hook_count, 'hits': self.hits}

    def _detached(self, pid, reason, crash=None):
        with self.lock:
            if self.pid != pid:
                return
            self.pid = self.session = self.script = None
            self.state = 'exited' if reason == 'process-terminated' else 'detached'
        self.emit('process_exited' if reason == 'process-terminated' else 'detached', pid=pid, payload={'reason': reason})

    def _message(self, pid, message, data):
        if message.get('type') == 'send':
            payload = message.get('payload', {})
            if payload.get('kind') == 'hook_batch':
                events = payload.get('events', [])[:100]
                with self.lock:
                    self.hits += len(events) + payload.get('dropped', 0)
                self.emit('hook_event', pid=pid, payload={'events': events, 'dropped': payload.get('dropped', 0)})
        elif message.get('type') == 'error':
            self.emit('error', pid=pid, error=message.get('stack', message.get('description', 'Hook 脚本异常')))

    def launch(self, config):
        exe, args, cwd = validate(config)
        with self.lock:
            if self.pid is not None:
                raise ValueError('已有目标进程，请先终止或停止监控')
            self.state = 'initializing'
            self.hits = self.hook_count = 0
        pid = None
        session = None
        guard = None
        try:
            # Frida 17.x exposes cwd as a native spawn option via **kwargs.
            # Unsupported versions fail explicitly; never silently use a different cwd.
            pid = self.device.spawn([exe, *args], cwd=cwd, stdio='pipe')
            guard = StartupGuard(pid)
            with self.lock:
                self.pid = pid
            self.emit('process_started', pid=pid, payload={'state': 'suspended', 'exe': exe})
            session = self.device.attach(pid)
            session.on('detached', lambda reason, crash=None: self._detached(pid, reason, crash))
            hook_dir = Path(__file__).parent / 'hooks'
            source = 'const CONFIG = ' + json.dumps(config) + ';\nconst LANGIDS = ' + json.dumps(LOCALES) + ';\n'
            source += '\n'.join((hook_dir / name).read_text(encoding='utf-8') for name in ['runtime.js', 'device_region.js', 'language.js', 'timezone.js', 'geo_region.js'])
            script = session.create_script(source)
            script.on('message', lambda message, data: self._message(pid, message, data))
            script.load()
            result = script.exports_sync.initialize()
            with self.lock:
                if self.pid != pid:
                    raise RuntimeError('目标在初始化期间退出')
                self.session, self.script = session, script
                self.hook_count = result['hookCount']
                self.started = time.time()
                self.state = 'running'
            self.emit('hook_loaded', pid=pid, payload=result)
            self.device.resume(pid)
            guard.release()
            guard = None
            if self.pid == pid:
                self.emit('process_resumed', pid=pid, payload=self.status())
            return self.status()
        except Exception:
            if guard is not None:
                try:
                    guard.abort()
                except Exception as cleanup_error:
                    self.emit('error', pid=pid, error='初始化守护进程清理失败: ' + str(cleanup_error))
            # No suspended orphan on partial initialization failure.
            if pid is not None:
                try:
                    self.device.kill(pid)
                except Exception as cleanup_error:
                    self.emit('error', pid=pid, error='目标清理返回: ' + str(cleanup_error))
            if session is not None:
                try:
                    session.detach()
                except Exception:
                    pass
            with self.lock:
                self.pid = self.session = self.script = None
                self.state = 'error'
            raise

    def stop(self):
        pid = self.pid
        if pid is not None:
            self.device.kill(pid)
        return self.status()

    def detach(self):
        session, script, pid = self.session, self.script, self.pid
        if session:
            if script:
                try:
                    script.exports_sync.flush()
                except frida.InvalidOperationError:
                    pass
            session.detach()
            self._detached(pid, 'application-requested')
        return self.status()
