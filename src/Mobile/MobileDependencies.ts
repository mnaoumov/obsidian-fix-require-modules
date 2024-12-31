import type { PlatformDependencies } from '../PlatformDependencies.ts';

import { fileSystemWrapper } from './MobileFileSystemWrapper.ts';
import { requireHandler } from './MobileRequireHandler.ts';
import { registerScriptDirectoryWatcher } from './MobileScriptDirectoryWatcher.ts';

export const platformDependencies: PlatformDependencies = {
  fileSystemWrapper,
  registerScriptDirectoryWatcher,
  requireHandler
};
