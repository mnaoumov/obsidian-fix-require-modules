import type { App } from 'obsidian';

import type { FileSystemWrapper } from '../FileSystemWrapper.ts';

export class MobileFileSystemWrapper implements FileSystemWrapper {
  public readonly hasSyncMethods = false;
  public constructor(private readonly app: App) {
    console.log(this.app);
  }
}
