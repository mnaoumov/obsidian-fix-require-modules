import type { FileSystemWrapper } from '../FileSystemWrapper.ts';

export const fileSystemWrapper: FileSystemWrapper = {
  hasSyncMethods: false,
  register() {
    return;
  }
};
