import type { App } from 'obsidian';

import type { FileSystemWrapper } from '../FileSystemWrapper.ts';

import { MobileFileSystemWrapper } from './MobileFileSystemWrapper.ts';
import type { RequireHandler } from '../RequireHandler.ts';
import { MobileRequireHandler } from './MobileRequireHandler.ts';

export { registerScriptDirectoryWatcher } from './MobileScriptDirectoryWatcher.ts';

export function getFileSystemWrapper(app: App): FileSystemWrapper {
  return new MobileFileSystemWrapper(app);
}

export function getRequireHandler(originalRequire: NodeRequire): RequireHandler {
  return new MobileRequireHandler(originalRequire);
}
