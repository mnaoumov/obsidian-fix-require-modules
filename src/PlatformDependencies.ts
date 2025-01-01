import { Platform } from 'obsidian';

import type { CustomRequire } from './CustomRequire.ts';
import type { ScriptDirectoryWatcher } from './ScriptDirectoryWatcher.ts';

export interface PlatformDependencies {
  customRequire: CustomRequire;
  scriptDirectoryWatcher: ScriptDirectoryWatcher;
}

export async function getPlatformDependencies(): Promise<PlatformDependencies> {
  const module = Platform.isMobile
    ? await import('./Mobile/Dependencies.ts')
    : await import('./Desktop/Dependencies.ts');
  return module.platformDependencies;
}
