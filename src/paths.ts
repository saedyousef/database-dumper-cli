import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { getPlatformInfo } from './platform.js';

const APP_NAME = 'database-cli-dumper';

function homeDir() {
  return os.homedir();
}

export function getConfigDir(): string {
  const { platform } = getPlatformInfo();
  if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(homeDir(), 'AppData', 'Roaming');
    return path.join(appData, APP_NAME);
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) {
    return path.join(xdg, APP_NAME);
  }
  return path.join(homeDir(), '.config', APP_NAME);
}

export function getConfigPath(customPath?: string): string {
  if (customPath) return customPath;
  return path.join(getConfigDir(), 'config.json');
}

export function getBinaryCacheDir(): string {
  const { platform, arch } = getPlatformInfo();
  return path.join(homeDir(), `.${APP_NAME}`, 'bin', `${platform}-${arch}`);
}

export function getLogsDir(): string {
  return path.join(homeDir(), `.${APP_NAME}`, 'logs');
}

export function getTempDumpRoot(): string {
  return path.join(os.tmpdir(), APP_NAME);
}

export function getBackupDir(): string {
  return path.join(getConfigDir(), 'backups');
}

export function ensureDirSync(dir: string) {
  fs.ensureDirSync(dir);
}

export function resolveDumpPath(base: string, ...parts: string[]): string {
  return path.join(base, ...parts);
}
