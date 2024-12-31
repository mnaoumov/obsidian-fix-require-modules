import type { App } from 'obsidian';

import type { FileSystemWrapper } from '../FileSystemWrapper.ts';

import { MobileFileSystemWrapper } from './MobileFileSystemWrapper.ts';

export { registerScriptDirectoryWatcher } from './ScriptDirectoryWatcher.ts';

export function getFileSystemWrapper(app: App): FileSystemWrapper {
  return new MobileFileSystemWrapper(app);
}
