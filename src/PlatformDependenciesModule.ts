import { Platform } from 'obsidian';

import type { PlatformDependencies } from './PlatformDependencies.ts';

interface PlatformDependenciesModule {
  platformDependencies: PlatformDependencies;
}

export async function getPlatformDependencies(): Promise<PlatformDependencies> {
  const module = Platform.isMobile
    ? await import('./Mobile/Dependencies.ts') as PlatformDependenciesModule
    : await import('./Desktop/Dependencies.ts') as PlatformDependenciesModule;
  return module.platformDependencies;
}
