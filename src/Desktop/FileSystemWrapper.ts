import type { FileSystemWrapper } from '../FileSystemWrapper.ts';

export const fileSystemWrapper: FileSystemWrapper = {
  hasSyncMethods: true,
  register() {
    return;
  }
};
