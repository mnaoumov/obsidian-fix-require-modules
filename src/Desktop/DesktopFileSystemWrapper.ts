import type { App } from 'obsidian';

import type { FileSystemWrapper } from '../FileSystemWrapper.ts';

export class DesktopFileSystemWrapper implements FileSystemWrapper {
  public readonly hasSyncMethods = true;

  public constructor(private readonly app: App) { }
}
