"""Frida process tree: only explicitly spawned root and gated descendants."""
import copy
import json
from pathlib import Path
import threading
import time
import frida
from config import validate, LOCALES
from process_manager import StartupGuard

class FridaManager:
    MAX_PROCESSES = 32

    def __init__(self, emit, device=None):
        self.emit = emit
        self.device = device or frida.get_local_device()
        self.lock = threading.RLock()
        self.pid = self.session = self.script = self.started = None
        self.state = 'idle'
        self.hook_count = self.hits = 0
        self.processes = {}
        self.children_enabled = False
        self.closing = False
        self.generation = 0
        self.source = ''
        self.device.on('child-added', self._child_added)

    def status(self):
        with self.lock:
            return {'pid': self.pid, 'state': self.state, 'started': self.started,
                    'hookCount': self.hook_count, 'hits': self.hits,
                    'processes': [{k: c[k] for k in ('pid', 'parentPid', 'role', 'state', 'hookCount')}
                                  for c in self.processes.values()]}

    def _tree(self):
        self.emit('process_tree', payload=self.status())

    def _context(self, pid, parent=None):
        return {'pid': pid, 'parentPid': parent, 'role': 'main' if parent is None else 'child',
                'state': 'initializing', 'hookCount': 0, 'session': None, 'script': None,
                'guard': None, 'cancelled': False, 'source': self.source, 'generation': self.generation}

    def _detached(self, context, reason, crash=None):
        pid = context['pid']
        with self.lock:
            if self.processes.get(pid) is not context:
                return
            self.processes.pop(pid)
            context['cancelled'] = True
            if context['role'] == 'main':
                self.pid = self.session = self.script = None
            self.state = 'running' if self.processes else 'exited' if reason == 'process-terminated' else 'detached'
        event = ('process_exited' if reason == 'process-terminated' else 'detached') if context['role'] == 'main' else ('child_exited' if reason == 'process-terminated' else 'child_detached')
        self.emit(event, pid=pid, payload={'reason': reason, 'parentPid': context['parentPid'], 'remainingProcesses': len(self.status()['processes'])})
        self._tree()

    def _message(self, context, message, data):
        pid = context['pid']
        with self.lock:
            # Frida can deliver the final buffered message after detached.
            # Keep that run's evidence, but never mix it into a later launch.
            if context['generation'] != self.generation:
                return
        if message.get('type') == 'send':
            payload = message.get('payload', {})
            if payload.get('kind') == 'font_resource':
                self.emit('font_resource', pid=pid, payload={'text': payload['text']})
            if payload.get('kind') == 'hook_batch':
                events = payload.get('events', [])[:100]
                with self.lock:
                    self.hits += len(events) + payload.get('dropped', 0)
                self.emit('hook_event', pid=pid, payload={'events': events, 'dropped': payload.get('dropped', 0), 'role': context['role']})
        elif message.get('type') == 'error':
            self.emit('error', pid=pid, error=message.get('stack', message.get('description', 'Hook 脚本异常')))

    def _check(self, context):
        with self.lock:
            if context['cancelled'] or self.closing or self.processes.get(context['pid']) is not context:
                raise RuntimeError(context.get('rejection', '进程已退出或取消注入'))

    def _instrument(self, context):
        pid = context['pid']
        session = None
        guard = None
        try:
            guard = StartupGuard(pid)
            context['guard'] = guard
            self._check(context)
            session = self.device.attach(pid)
            context['session'] = session
            session.on('detached', lambda reason, crash=None: self._detached(context, reason, crash))
            self._check(context)
            if self.children_enabled:
                session.enable_child_gating()
            script = session.create_script(context['source'])
            context['script'] = script
            script.on('message', lambda message, data: self._message(context, message, data))
            script.load()
            result = script.exports_sync.initialize()
            self._check(context)
            with self.lock:
                context['hookCount'] = result['hookCount']
                if context['role'] == 'main':
                    self.session, self.script = session, script
                    self.hook_count = result['hookCount']
                    self.started = time.time()
            self.emit('hook_loaded' if context['role'] == 'main' else 'child_hook_loaded', pid=pid, payload={**result, 'parentPid': context['parentPid']})
            self._check(context)
            self.device.resume(pid)
            with self.lock:
                # Commit guardian release and running state atomically against
                # stop/detach. Otherwise stop may abort an already released
                # guardian and accidentally leave the resumed process alive.
                if context.get('cancel_reason') or self.closing:
                    raise RuntimeError('初始化已取消')
                guard.release()
                context['guard'] = None
                guard = None
                if self.processes.get(pid) is context and not context['cancelled']:
                    context['state'] = 'running'
                    self.state = 'running'
                else:
                    return
            self.emit('process_resumed' if context['role'] == 'main' else 'child_resumed', pid=pid, payload=self.status())
            self._tree()
        except Exception:
            # Guard owns an exact process HANDLE and also survives backend crashes.
            if guard is not None:
                try: guard.abort()
                except Exception as error: self.emit('error', pid=pid, error='初始化守护进程清理失败: ' + str(error))
            else:
                try: self.device.kill(pid)
                except Exception: pass
            if session is not None:
                try: session.detach()
                except Exception: pass
            with self.lock:
                if self.processes.get(pid) is context:
                    self.processes.pop(pid)
                if context['role'] == 'main' and self.pid == pid:
                    self.pid = self.session = self.script = None
                if not context.get('cancel_reason'):
                    self.state = 'running' if self.processes else 'error'
            self._tree()
            if context.get('cancel_reason'):
                return
            raise

    def _child_added(self, child):
        # Never perform synchronous Frida operations on its callback thread.
        with self.lock:
            parent = self.processes.get(child.parent_pid)
            if parent is None or not self.children_enabled:
                return
            if child.pid in self.processes:
                return
            context = self._context(child.pid, child.parent_pid)
            reject = self.closing or len(self.processes) >= self.MAX_PROCESSES
            context['cancelled'] = reject
            if reject: context['rejection'] = '已停止监控或达到 32 个进程上限；未注入子进程已终止'
            self.processes[child.pid] = context
        self.emit('child_started', pid=child.pid, payload={'parentPid': child.parent_pid, 'state': 'suspended'})
        self._tree()
        def run():
            try:
                self._instrument(context)
            except Exception as error:
                with self.lock:
                    if self.processes.get(child.pid) is context:
                        self.processes.pop(child.pid)
                self.emit('child_error', pid=child.pid, error=str(error), payload={'parentPid': child.parent_pid})
                self._tree()
        threading.Thread(target=run, name='frida-child-' + str(child.pid), daemon=True).start()

    def launch(self, config):
        exe, args, cwd = validate(config)
        with self.lock:
            if self.processes:
                raise ValueError('已有受监控进程，请先终止或停止监控')
            self.closing = False
            self.generation += 1
            self.children_enabled = bool(config.get('children', False))
            self.state = 'initializing'
            self.hits = self.hook_count = 0
            hook_dir = Path(__file__).parent / 'hooks'
            self.source = 'const CONFIG = ' + json.dumps(copy.deepcopy(config)) + ';\nconst LANGIDS = ' + json.dumps(LOCALES) + ';\n'
            self.source += '\n'.join((hook_dir / name).read_text(encoding='utf-8') for name in ['runtime.js', 'device_region.js', 'language.js', 'timezone.js', 'geo_region.js', 'encoding.js', 'font.js'])
        try:
            pid = self.device.spawn([exe, *args], cwd=cwd, stdio='pipe')
            context = self._context(pid)
            with self.lock:
                self.pid = pid
                self.processes[pid] = context
            self.emit('process_started', pid=pid, payload={'state': 'suspended', 'exe': exe})
            self._instrument(context)
            return self.status()
        except Exception:
            with self.lock:
                self.state = 'running' if self.processes else 'error'
            raise

    def _close(self, terminate):
        with self.lock:
            self.closing = True
            contexts = list(self.processes.values())
            for context in contexts:
                context['cancelled'] = True
                context['cancel_reason'] = 'stop' if terminate else 'detach'
        # Disable gating before releasing sessions. Initializing children are
        # aborted, while running processes survive a user-requested detach.
        for context in contexts:
            session = context['session']
            if session and self.children_enabled:
                try: session.disable_child_gating()
                except Exception: pass
            if context['guard']:
                try: context['guard'].abort()
                except Exception: pass
            elif terminate:
                try: self.device.kill(context['pid'])
                except frida.ProcessNotFoundError: pass
            if session:
                try:
                    if not terminate and context['script']:
                        try: context['script'].exports_sync.cleanup()
                        except Exception as error: self.emit('error', pid=context['pid'], error='资源清理失败: ' + str(error))
                        context['script'].exports_sync.flush()
                    session.detach()
                except frida.InvalidOperationError: pass
            self._detached(context, 'process-terminated' if terminate else 'application-requested')
        with self.lock:
            self.state = 'exited' if terminate else 'detached'
        self._tree()
        return self.status()

    def stop(self): return self._close(True)
    def detach(self): return self._close(False)
