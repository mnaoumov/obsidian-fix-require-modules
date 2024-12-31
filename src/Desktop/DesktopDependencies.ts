import type { PlatformDependencies } from '../PlatformDependencies.ts';

import { fileSystemWrapper } from './DesktopFileSystemWrapper.ts';
import { requireHandler } from './DesktopRequireHandler.ts';
import { registerScriptDirectoryWatcher } from './DesktopScriptDirectoryWatcher.ts';

export const platformDependencies: PlatformDependencies = {
  fileSystemWrapper,
  registerScriptDirectoryWatcher,
  requireHandler
};
