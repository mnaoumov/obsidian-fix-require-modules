import {
  Notice,
  Plugin,
  requestUrl
} from "obsidian";
import {
  dirname,
  join
} from "path";

export const ESBUILD_MAIN_PATH = "node_modules/esbuild/lib/main.js";
const ESBUILD_EXE_PATH = "node_modules/@esbuild/win32-x64/esbuild.exe";
const ESBUILD_MAIN_URL = "https://unpkg.com/esbuild@0.21.4/lib/main.js";
const ESBUILD_EXE_URL = "https://unpkg.com/@esbuild/win32-x64@0.21.4/esbuild.exe";

export async function downloadEsbuild(plugin: Plugin): Promise<void> {
  const app = plugin.app;
  const assets = {
    [ESBUILD_MAIN_PATH]: ESBUILD_MAIN_URL,
    [ESBUILD_EXE_PATH]: ESBUILD_EXE_URL
  } as Record<string, string>;

  for (const [path, url] of Object.entries(assets)) {
    const fullPath = join(plugin.manifest.dir!, path);
    if (await app.vault.adapter.exists(fullPath)) {
      continue;
    }

    const notice = new Notice("In order to use this plugin, we need to download some esbuild assets. This will only happen once. Please wait...");

    const response = await requestUrl(url);
    if (response.status !== 200) {
      const message = `Failed to download ${url}. Disabling the plugin...`;
      new Notice(message);
      console.error(message);
      await app.plugins.disablePlugin(plugin.manifest.id);
    }

    const dir = dirname(fullPath);
    if (!await app.vault.adapter.exists(dir)) {
      await app.vault.adapter.mkdir(dir);
    }
    await app.vault.adapter.writeBinary(fullPath, response.arrayBuffer);
    notice.hide();
  }
}
