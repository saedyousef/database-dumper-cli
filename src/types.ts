import type { Platform, Arch } from './platform.js';

export type DbType = 'mysql';

export interface DatabaseConfig {
  id: string;
  dbType: DbType;
  environment: string;
  name: string;
  alias?: string;
  host: string;
  port?: number;
  username: string;
  passwordRef: string;
  selectedFlags: string[];
  customFlags?: string[];
  gzipDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConfigFile {
  version: number;
  databases: DatabaseConfig[];
  defaults?: {
    lastSelectedId?: string;
    dumpRootOverride?: string;
  };
}

export interface FlagOption {
  id: string;
  flag: string;
  label: string;
  description: string;
  caution?: string;
  defaultSelected?: boolean;
}

export interface BinaryDescriptor {
  version: string;
  platform: Platform;
  arch: Arch;
  url: string;
  sha256: string;
  archiveType: 'zip' | 'tar.gz' | 'tar.xz';
  innerPathHints?: string[]; // e.g., potential paths to mysqldump inside archive
}

export interface DumpRequest {
  db: DatabaseConfig;
  password: string;
  outputPath: string;
  gzip: boolean;
  excludeTables: string[];
  flags: string[];
  binaryPath: string;
}

export interface DumpResult {
  outputPath: string;
  sizeBytes: number;
  durationMs: number;
  gzip: boolean;
}

export interface ConnectionTestResult {
  ok: boolean;
  message?: string;
  error?: unknown;
}
