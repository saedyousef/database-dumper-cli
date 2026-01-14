import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import zlib from 'zlib';
import { DumpRequest, DumpResult } from './types.js';
import { log } from './logger.js';

export async function runDump(req: DumpRequest): Promise<DumpResult> {
  await fs.ensureDir(path.dirname(req.outputPath));

  const args: string[] = [];
  args.push(`--host=${req.db.host}`);
  args.push(`--user=${req.db.username}`);
  if (req.db.port) args.push(`--port=${req.db.port}`);
  args.push(...req.flags);
  if (req.excludeTables.length) {
    for (const table of req.excludeTables) {
      args.push(`--ignore-table=${req.db.name}.${table}`);
    }
  }
  args.push(req.db.name);

  const child = spawn(req.binaryPath, args, {
    env: { ...process.env, MYSQL_PWD: req.password },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const startedAt = Date.now();
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += d.toString();
  });

  let bytes = 0;
  const output = fs.createWriteStream(req.outputPath);
  const progressInterval = setInterval(() => {
    log.dim(`Dumping... ${Math.round(bytes / 1024)} KB written`);
  }, 1500);

  const cleanup = async (err?: Error) => {
    clearInterval(progressInterval);
    output.close();
    if (err) {
      await fs.remove(req.outputPath).catch(() => undefined);
    }
  };

  const stream = req.gzip ? zlib.createGzip() : null;
  const source = req.gzip ? child.stdout.pipe(stream!) : child.stdout;

  source.on('data', (chunk) => {
    bytes += chunk.length;
  });

  const piping = source.pipe(output);

  const result = await new Promise<DumpResult>((resolve, reject) => {
    piping.on('error', async (err: Error) => {
      await cleanup(err);
      reject(err);
    });
    child.on('error', async (err) => {
      await cleanup(err as Error);
      reject(err);
    });
    child.on('exit', async (code) => {
      clearInterval(progressInterval);
      if (code !== 0) {
        await cleanup(new Error(stderr || `mysqldump exited with ${code}`));
        reject(new Error(stderr || `mysqldump exited with ${code}`));
        return;
      }
      const stats = await fs.stat(req.outputPath);
      resolve({
        outputPath: req.outputPath,
        sizeBytes: stats.size,
        durationMs: Date.now() - startedAt,
        gzip: req.gzip,
      });
    });
  });

  return result;
}
