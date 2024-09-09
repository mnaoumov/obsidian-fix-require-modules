import {
  Platform,
  Plugin
} from 'obsidian';
import { isUrl } from 'obsidian-dev-utils/url';

import { customRequire } from './CustomRequire.ts';

declare global {
  interface Window {
    dynamicImport?: typeof dynamicImport;
  }
}

export function registerDynamicImport(plugin: Plugin): void {
  window.dynamicImport = dynamicImport;
  plugin.register(() => delete window.dynamicImport);
}

async function dynamicImport(moduleName: string, currentScriptPath?: string): Promise<unknown> {
  const FILE_URL_PREFIX = 'file:///';
  if (moduleName.toLowerCase().startsWith(FILE_URL_PREFIX)) {
    moduleName = moduleName.substring(FILE_URL_PREFIX.length);
  } else if (moduleName.toLowerCase().startsWith(Platform.resourcePathPrefix)) {
    moduleName = moduleName.substring(Platform.resourcePathPrefix.length);
  } else if (isUrl(moduleName)) {
    return await import(moduleName) as unknown;
  }

  return customRequire(moduleName, currentScriptPath);
}
