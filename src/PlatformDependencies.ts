import type { FileSystemWrapper } from './FileSystemWrapper.ts';
import type { FixRequireModulesPlugin } from './FixRequireModulesPlugin.ts';
import type { RequireHandler } from './RequireHandler.ts';

export interface PlatformDependencies {
  fileSystemWrapper: FileSystemWrapper;
  registerScriptDirectoryWatcher(plugin: FixRequireModulesPlugin, onChange: () => Promise<void>): Promise<void>;
  requireHandler: RequireHandler;
}
