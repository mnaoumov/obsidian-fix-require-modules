import { Platform } from 'obsidian';
import { isAbsolute } from 'obsidian-dev-utils/Path';

export function convertPathToObsidianUrl(path: string): string {
  if (!isAbsolute(path)) {
    return path;
  }

  return Platform.resourcePathPrefix + path.replaceAll('\\', '/');
}
