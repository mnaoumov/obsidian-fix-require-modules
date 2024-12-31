import type { App } from 'obsidian';

export interface FileSystemWrapper {
  readonly hasSyncMethods: boolean;
  register(app: App): void;
}
