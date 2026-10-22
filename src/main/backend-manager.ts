import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { app } from 'electron';
import { JsonLines } from '../shared/protocol';
import type { Message } from '../shared/types';

export class BackendManager {
  private child?: ChildProcessWithoutNullStreams;
  private ready?: Promise<void>;
  private pending = new Map<string, { resolve: (m: Message) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  constructor(private emit: (m: Message) => void) {}
  private start() {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      const root = app.getAppPath();
      const command = app.isPackaged ? join(process.resourcesPath, 'backend', 'frl-backend.exe') : join(root, '.venv', 'Scripts', 'python.exe');
      const args = app.isPackaged ? [] : ['-u', join(root, 'backend', 'main.py')];
      const child = spawn(command, args, { windowsHide: true, shell: false, stdio: 'pipe', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
      this.child = child;
      const parser = new JsonLines(), decoder = new StringDecoder('utf8');
      let settled = false;
      const fail = (error: Error) => {
        clearTimeout(timer); this.child = undefined; this.ready = undefined;
        if (!settled) { settled = true; reject(error); }
        for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
        this.pending.clear();
        this.emit({ type: 'event', event: 'backend_error', timestamp: new Date().toISOString(), error: error.message });
      };
      const timer = setTimeout(() => { child.kill(); fail(new Error('Frida 后端启动超时')); }, 15000);
      child.on('error', fail);
      child.on('exit', (code, signal) => fail(new Error(`Frida 后端已退出 (${code ?? signal})；监控连接已断开`)));
      child.stdin.on('error', error => fail(error));
      child.stdout.on('data', (chunk: Buffer) => {
        try {
          for (const m of parser.push(decoder.write(chunk))) {
            if (m.event === 'backend_ready') { clearTimeout(timer); settled = true; resolve(); }
            if (m.type === 'response' && m.requestId) {
              const p = this.pending.get(m.requestId);
              if (p) { clearTimeout(p.timer); this.pending.delete(m.requestId); m.error ? p.reject(new Error(m.error)) : p.resolve(m); }
            }
            this.emit(m);
          }
        } catch (error) { child.kill(); fail(error as Error); }
      });
      child.stderr.on('data', (chunk: Buffer) => {
        this.emit({ type: 'event', event: 'backend_diagnostic', timestamp: new Date().toISOString(), payload: { text: chunk.toString('utf8').slice(0, 8000) } });
      });
    });
    return this.ready;
  }
  async request(command: string, payload?: unknown): Promise<Message> {
    await this.start();
    return new Promise((resolve, reject) => {
      const requestId = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(requestId); reject(new Error('后端请求超时，请检查运行日志'));
        this.child?.kill();
      }, 35000);
      this.pending.set(requestId, { resolve, reject, timer });
      this.child!.stdin.write(JSON.stringify({ type: 'request', command, requestId, payload }) + '\n');
    });
  }
  async shutdown() {
    if (this.child) {
      const child = this.child;
      const timer = setTimeout(() => child.kill(), 4000);
      try { await this.request('shutdown'); } catch { /* already reported */ }
      finally { clearTimeout(timer); child.kill(); }
    }
  }
}
