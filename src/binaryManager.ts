import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import extractZip from 'extract-zip';
import { getPlatformInfo } from './platform.js';
import { resolveBinaryDescriptor } from './versionMap.js';
import { getBinaryCacheDir } from './paths.js';
import { sha256File } from './checksum.js';
import { downloadToFile } from './downloader.js';

const BINARY_NAMES = {
  win32: 'mysqldump.exe',
  default: 'mysqldump',
};

async function findBinary(root: string, names: string[]): Promise<string | undefined> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const found = await findBinary(full, names);
      if (found) return found;
    } else if (names.includes(entry.name)) {
      return full;
    }
  }
  return undefined;
}

export async function ensureBinary(customPath?: string): Promise<string> {
  if (customPath) {
    const resolved = path.resolve(customPath);
    const exists = await fs.pathExists(resolved);
    if (!exists) throw new Error(`Binary override not found at ${resolved}`);
    return resolved;
  }

  const { platform, arch, isWindows } = getPlatformInfo();
  const descriptor = resolveBinaryDescriptor(platform, arch);
  if (!descriptor) {
    throw new Error(`Unsupported platform/arch: ${platform}-${arch}. Please update version map.`);
  }

  const cacheDir = getBinaryCacheDir();
  const binaryName = isWindows ? BINARY_NAMES.win32 : BINARY_NAMES.default;
  const targetPath = path.join(cacheDir, binaryName);

  if (await fs.pathExists(targetPath)) {
    return targetPath;
  }

  // Ensure cache directory exists
  await fs.ensureDir(cacheDir);

  // Prepare download
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mysqldump-download-'));
  const archivePath = path.join(tmpDir, `mysqldump-${descriptor.platform}-${descriptor.arch}.${descriptor.archiveType.replace('.', '')}`);

  await downloadToFile(descriptor.url, archivePath);

  // Verify checksum
  const actualSha = await sha256File(archivePath);
  if (descriptor.sha256 && descriptor.sha256 !== 'REPLACE_WITH_OFFICIAL_SHA256' && actualSha !== descriptor.sha256) {
    throw new Error(`Checksum mismatch for mysqldump archive. Expected ${descriptor.sha256}, got ${actualSha}.`);
  }

  // Extract
  const extractDir = path.join(tmpDir, 'extract');
  await fs.ensureDir(extractDir);

  if (descriptor.archiveType === 'zip') {
    await extractZip(archivePath, { dir: extractDir });
  } else {
    const tarArgs = descriptor.archiveType === 'tar.xz' ? ['-xJf', archivePath, '-C', extractDir] : ['-xzf', archivePath, '-C', extractDir];
    await new Promise<void>((resolve, reject) => {
      const tar = spawn('tar', tarArgs);
      tar.on('error', reject);
      tar.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`tar exited with code ${code}`));
      });
    });
  }

  const found = await findBinary(extractDir, ['mysqldump', 'mysqldump.exe']);
  if (!found) {
    throw new Error('mysqldump binary not found in downloaded archive. Check version map or artifact layout.');
  }

  await fs.move(found, targetPath, { overwrite: true });
  if (!isWindows) {
    await fs.chmod(targetPath, 0o755);
  }

  await fs.remove(tmpDir);
  return targetPath;
}
