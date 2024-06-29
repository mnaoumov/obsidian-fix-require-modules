import { Platform } from "obsidian";
import type { UninstallerRegister } from "./UninstallerRegister.d.ts";

declare global {
  interface Window {
    dynamicImport?: typeof dynamicImport;
  }
}

export function registerDynamicImport(uninstallerRegister: UninstallerRegister) {
  window.dynamicImport = dynamicImport;
  uninstallerRegister(() => delete window.dynamicImport);
}

async function dynamicImport(moduleName: string): Promise<unknown> {
  const FILE_URL_PREFIX = "file:///";
  if (moduleName.toLowerCase().startsWith(FILE_URL_PREFIX)) {
    moduleName = moduleName.substring(FILE_URL_PREFIX.length);
  } else if (moduleName.toLowerCase().startsWith(Platform.resourcePathPrefix)) {
    moduleName = moduleName.substring(Platform.resourcePathPrefix.length);
  } else if (isUrl(moduleName)) {
    return await import(moduleName);
  }

  return window.require(moduleName);
}

function isUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol !== "file:";
  } catch {
    return false;
  }
}
