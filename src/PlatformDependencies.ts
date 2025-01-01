import { Platform } from 'obsidian';

import type { FileSystemWrapper } from './FileSystemWrapper.ts';
import type { RequireHandler } from './RequireHandler.ts';
import type { ScriptDirectoryWatcher } from './ScriptDirectoryWatcher.ts';

export interface PlatformDependencies {
  fileSystemWrapper: FileSystemWrapper;
  requireHandler: RequireHandler;
  scriptDirectoryWatcher: ScriptDirectoryWatcher;
}

export async function getPlatformDependencies(): Promise<PlatformDependencies> {
  const module = Platform.isMobile
    ? await import('./Mobile/Dependencies.ts')
    : await import('./Desktop/Dependencies.ts');
  return module.platformDependencies;
}
