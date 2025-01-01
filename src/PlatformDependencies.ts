import { Platform } from 'obsidian';

import type { FileSystemWrapper } from './FileSystemWrapper.ts';
import type { FixRequireModulesPlugin } from './FixRequireModulesPlugin.ts';
import type { RequireHandler } from './RequireHandler.ts';

export interface PlatformDependencies {
  fileSystemWrapper: FileSystemWrapper;
  registerScriptDirectoryWatcher(plugin: FixRequireModulesPlugin, onChange: () => Promise<void>): Promise<void>;
  requireHandler: RequireHandler;
}

interface PlatformDependenciesModule {
  platformDependencies: PlatformDependencies;
}

export async function getPlatformDependencies(): Promise<PlatformDependencies> {
  const module = Platform.isMobile
    ? await import('./Mobile/Dependencies.ts') as PlatformDependenciesModule
    : await import('./Desktop/Dependencies.ts') as PlatformDependenciesModule;
  return module.platformDependencies;
}
