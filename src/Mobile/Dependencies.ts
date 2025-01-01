import type { PlatformDependencies } from '../PlatformDependencies.ts';

import { fileSystemWrapper } from './FileSystemWrapper.ts';
import { requireHandler } from './RequireHandler.ts';
import { scriptDirectoryWatcher } from './ScriptDirectoryWatcher.ts';

export const platformDependencies: PlatformDependencies = {
  fileSystemWrapper,
  requireHandler,
  scriptDirectoryWatcher
};
