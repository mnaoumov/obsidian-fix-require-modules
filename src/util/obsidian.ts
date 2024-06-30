import { Platform } from "obsidian";
import { isAbsolute } from "path";

export function convertPathToObsidianUrl(path: string): string {
  if (!isAbsolute(path)) {
    return path;
  }

  return Platform.resourcePathPrefix + path.replaceAll("\\", "/");
}
