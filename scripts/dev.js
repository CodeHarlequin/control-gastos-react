import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npm';
const npmArgs = isWindows ? ['/d', '/s', '/c', 'npm run dev:web'] : ['run', 'dev:web'];
const nodeCommand = process.execPath;
const api = spawn(nodeCommand, ['server/index.js'], { stdio: 'inherit' });
const web = spawn(npmCommand, npmArgs, { stdio: 'inherit' });

let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  api.kill('SIGTERM');
  web.kill('SIGTERM');
  setTimeout(() => process.exit(code), 250);
}

api.on('exit', (code) => {
  if (!closing) close(code || 1);
});
web.on('exit', (code) => {
  if (!closing) close(code || 0);
});
process.on('SIGINT', () => close(0));
process.on('SIGTERM', () => close(0));
