import { BinaryDescriptor } from './types.js';
import { Platform, Arch } from './platform.js';

// Pinned mysqldump version (MySQL 8.0.x LTS)
export const PINNED_MYSQL_VERSION = '8.0.36';

// Official Oracle MySQL 8.0.36 artifacts with verified SHA256 checksums.
export const BINARY_MAP: BinaryDescriptor[] = [
  {
    version: PINNED_MYSQL_VERSION,
    platform: 'linux',
    arch: 'x64',
    url: 'https://cdn.mysql.com/archives/mysql-8.0/mysql-8.0.36-linux-glibc2.28-x86_64.tar.xz',
    sha256: 'ffd80e375834dd07e25cc3c7f03ae1950668ec606655c9cb2eafdfb7e37d6026',
    archiveType: 'tar.xz',
    innerPathHints: ['mysql-8.0.36-linux-glibc2.28-x86_64/bin/mysqldump', 'bin/mysqldump'],
  },
  {
    version: PINNED_MYSQL_VERSION,
    platform: 'linux',
    arch: 'arm64',
    url: 'https://cdn.mysql.com/archives/mysql-8.0/mysql-8.0.36-linux-glibc2.28-aarch64.tar.xz',
    sha256: 'c05cc22cd0172e348739e2f269107702be24f500e5d820009d19b98ba596da7b',
    archiveType: 'tar.xz',
    innerPathHints: ['mysql-8.0.36-linux-glibc2.28-aarch64/bin/mysqldump', 'bin/mysqldump'],
  },
  {
    version: PINNED_MYSQL_VERSION,
    platform: 'darwin',
    arch: 'arm64',
    url: 'https://cdn.mysql.com/archives/mysql-8.0/mysql-8.0.36-macos14-arm64.tar.gz',
    sha256: 'c419d50bcbde8ad5e2cb895a2784cca6f1cc30fb26492dbd230abc7bb7bd2377',
    archiveType: 'tar.gz',
    innerPathHints: ['mysql-8.0.36-macos14-arm64/bin/mysqldump', 'bin/mysqldump'],
  },
  {
    version: PINNED_MYSQL_VERSION,
    platform: 'darwin',
    arch: 'x64',
    url: 'https://cdn.mysql.com/archives/mysql-8.0/mysql-8.0.36-macos14-x86_64.tar.gz',
    sha256: '99ffdfc3178a4542e4b8ed12582525fb06020c79b8731f6672e55ae5b4357347',
    archiveType: 'tar.gz',
    innerPathHints: ['mysql-8.0.36-macos14-x86_64/bin/mysqldump', 'bin/mysqldump'],
  },
  {
    version: PINNED_MYSQL_VERSION,
    platform: 'win32',
    arch: 'x64',
    url: 'https://cdn.mysql.com/archives/mysql-8.0/mysql-8.0.36-winx64.zip',
    sha256: 'a1bc2ad567eef672be20b591ad25b14f221e60bde3ae3eb235128d91e4166557',
    archiveType: 'zip',
    innerPathHints: ['mysql-8.0.36-winx64/bin/mysqldump.exe', 'bin/mysqldump.exe'],
  },
];

export function resolveBinaryDescriptor(platform: Platform, arch: Arch): BinaryDescriptor | undefined {
  return BINARY_MAP.find((b) => b.platform === platform && b.arch === arch);
}
