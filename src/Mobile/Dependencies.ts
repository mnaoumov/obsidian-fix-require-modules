import type { PlatformDependencies } from '../PlatformDependencies.ts';

import { requireHandler } from './RequireHandler.ts';
import { scriptFolderWatcher } from './ScriptFolderWatcher.ts';

export const platformDependencies: PlatformDependencies = {
  requireHandler,
  scriptFolderWatcher
};
