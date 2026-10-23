import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'pairon-browser-'));
const server = spawn(process.execPath, ['server/index.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: '3101', DB_PATH: join(directory, 'test.sqlite'), NODE_ENV: 'production' },
});
let stopping = false;
function stop() { if (!stopping) { stopping = true; server.kill('SIGTERM'); } }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
server.on('exit', (code) => { rmSync(directory, { recursive: true, force: true }); process.exitCode = stopping ? 0 : (code ?? 1); });
