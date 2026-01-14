import path from 'path';
import { getTempDumpRoot, resolveDumpPath } from './paths.js';

export function timestampString() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function defaultDumpPath(env: string, aliasOrName: string, gzip: boolean, rootOverride?: string) {
  const safeEnv = env || 'default';
  const safeName = aliasOrName || 'database';
  const root = rootOverride || getTempDumpRoot();
  const dir = resolveDumpPath(root, safeEnv, safeName);
  const filename = `${safeName}-${timestampString()}.sql${gzip ? '.gz' : ''}`;
  return path.join(dir, filename);
}
