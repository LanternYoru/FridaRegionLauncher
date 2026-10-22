// npm/pnpm use cmd.exe on Windows. Avoid invoking slash-separated EXE paths
// through that shell; pass a native absolute path directly to spawnSync.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const python = fileURLToPath(new URL('../.venv/Scripts/python.exe', import.meta.url));
const result = spawnSync(python, process.argv.slice(2), { stdio: 'inherit', shell: false });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
