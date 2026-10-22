import './build-electron.mjs';
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';
const server = await createServer(); await server.listen();
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, FRL_DEV: '1' } });
child.on('exit', async () => { await server.close(); process.exit(); });
