import type { PlatformDependencies } from '../PlatformDependencies.ts';

import { customRequire } from './CustomRequire.ts';
import { scriptDirectoryWatcher } from './ScriptDirectoryWatcher.ts';

export const platformDependencies: PlatformDependencies = {
  customRequire,
  scriptDirectoryWatcher
};
