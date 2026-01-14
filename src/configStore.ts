import fs from 'fs-extra';
import path from 'path';
import { ConfigFile, DatabaseConfig } from './types.js';
import { getBackupDir, getConfigDir, getConfigPath, ensureDirSync } from './paths.js';

export const SCHEMA_VERSION = 1;

const DEFAULT_CONFIG: ConfigFile = {
  version: SCHEMA_VERSION,
  databases: [],
};

async function ensureConfigDir(configPath?: string) {
  const target = configPath ? path.dirname(configPath) : getConfigDir();
  await fs.ensureDir(target);
}

export async function loadConfig(customPath?: string): Promise<ConfigFile> {
  const filePath = getConfigPath(customPath);
  await ensureConfigDir(filePath);
  const exists = await fs.pathExists(filePath);
  if (!exists) return { ...DEFAULT_CONFIG };
  const content = await fs.readFile(filePath, 'utf-8');
  const parsed = JSON.parse(content) as ConfigFile;
  if (!parsed.version) parsed.version = 1;
  return parsed;
}

export async function saveConfig(config: ConfigFile, customPath?: string): Promise<void> {
  const filePath = getConfigPath(customPath);
  await ensureConfigDir(filePath);
  config.version = SCHEMA_VERSION;

  // Backup existing
  if (await fs.pathExists(filePath)) {
    const backupDir = getBackupDir();
    ensureDirSync(backupDir);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `config.bak.${stamp}.json`);
    await fs.copyFile(filePath, backupPath);
  }

  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(config, null, 2));
  await fs.move(tmpPath, filePath, { overwrite: true });
}

export function upsertDatabase(config: ConfigFile, entry: DatabaseConfig): ConfigFile {
  const idx = config.databases.findIndex((d) => d.id === entry.id);
  if (idx >= 0) {
    config.databases[idx] = entry;
  } else {
    config.databases.push(entry);
  }
  return config;
}

export function deleteDatabase(config: ConfigFile, id: string): ConfigFile {
  config.databases = config.databases.filter((d) => d.id !== id);
  return config;
}

export function findDatabase(config: ConfigFile, idOrAlias: string): DatabaseConfig | undefined {
  return config.databases.find((d) => d.id === idOrAlias || d.alias === idOrAlias);
}
