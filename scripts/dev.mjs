import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const services = [
  spawn(process.execPath, ['--watch', 'server/index.mjs'], { stdio: 'inherit', env: process.env }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit', env: process.env }),
];
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const service of services) service.kill('SIGTERM');
  setTimeout(() => process.exit(code), 250).unref();
}
for (const service of services) {
  service.on('error', (error) => { console.error(error.message); shutdown(1); });
  service.on('exit', (code) => shutdown(code ?? 1));
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
