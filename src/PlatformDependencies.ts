import { Platform } from 'obsidian';

import type { FixRequireModulesPlugin } from './FixRequireModulesPlugin.ts';

export interface PlatformDependencies {
  registerScriptDirectoryWatcher: (plugin: FixRequireModulesPlugin) => void;
}

export async function getPlatformDependencies(): Promise<PlatformDependencies> {
  return Platform.isMobile
    ? await import('./Mobile/MobileDependencies.ts') as PlatformDependencies
    : await import('./Desktop/DesktopDependencies.ts') as PlatformDependencies;
}
