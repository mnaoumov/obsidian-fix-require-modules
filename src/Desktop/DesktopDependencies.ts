import type { App } from 'obsidian';

import type { FileSystemWrapper } from '../FileSystemWrapper.ts';

import { DesktopFileSystemWrapper } from './DesktopFileSystemWrapper.ts';
import { DesktopRequireHandler } from './DesktopRequireHandler.ts';
import type { RequireHandler } from '../RequireHandler.ts';

export { registerScriptDirectoryWatcher } from './DesktopScriptDirectoryWatcher.ts';

export function getFileSystemWrapper(app: App): FileSystemWrapper {
  return new DesktopFileSystemWrapper(app);
}

export function getRequireHandler(originalRequire: NodeRequire): RequireHandler {
  return new DesktopRequireHandler(originalRequire);
}
