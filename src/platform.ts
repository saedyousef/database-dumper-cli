import os from 'os';

export type Platform = NodeJS.Platform;
export type Arch = NodeJS.Architecture | string;

export interface PlatformInfo {
  platform: Platform;
  arch: Arch;
  isWindows: boolean;
}

export function getPlatformInfo(): PlatformInfo {
  const platform = os.platform();
  const arch = os.arch() as Arch;
  return {
    platform,
    arch,
    isWindows: platform === 'win32',
  };
}
