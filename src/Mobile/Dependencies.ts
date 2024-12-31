import type { PlatformDependencies } from '../PlatformDependencies.ts';

import { fileSystemWrapper } from './FileSystemWrapper.ts';
import { requireHandler } from './RequireHandler.ts';
import { registerScriptDirectoryWatcher } from './ScriptDirectoryWatcher.ts';

export const platformDependencies: PlatformDependencies = {
  fileSystemWrapper,
  registerScriptDirectoryWatcher,
  requireHandler
};
