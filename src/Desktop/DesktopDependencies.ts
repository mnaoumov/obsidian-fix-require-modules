import type { App } from 'obsidian';

import type { FileSystemWrapper } from '../FileSystemWrapper.ts';

import { DesktopFileSystemWrapper } from './DesktopFileSystemWrapper.ts';

export { registerScriptDirectoryWatcher } from './ScriptDirectoryWatcher.ts';

export function getFileSystemWrapper(app: App): FileSystemWrapper {
  return new DesktopFileSystemWrapper(app);
}
