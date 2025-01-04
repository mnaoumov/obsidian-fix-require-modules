import type { PlatformDependencies } from '../PlatformDependencies.ts';

import { requireHandler } from './RequireHandler.ts';
import { scriptDirectoryWatcher } from './ScriptDirectoryWatcher.ts';

export const platformDependencies: PlatformDependencies = {
  requireHandler,
  scriptDirectoryWatcher
};
