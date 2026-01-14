import { spawn } from 'child_process';
import { DumpRequest, ConnectionTestResult } from './types.js';

export async function testConnection(req: DumpRequest): Promise<ConnectionTestResult> {
  const args = [
    `--host=${req.db.host}`,
    `--user=${req.db.username}`,
  ];
  if (req.db.port) args.push(`--port=${req.db.port}`);
  args.push('--no-data');
  args.push(req.db.name);

  return new Promise<ConnectionTestResult>((resolve) => {
    const child = spawn(req.binaryPath, args, {
      env: { ...process.env, MYSQL_PWD: req.password },
      stdio: 'pipe',
    });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => resolve({ ok: false, message: err.message, error: err }));
    child.on('exit', (code) => {
      if (code === 0) return resolve({ ok: true });
      return resolve({ ok: false, message: stderr.trim() || `mysqldump exited with code ${code}` });
    });
  });
}
