import {
  Notice,
  Plugin,
  requestUrl
} from "obsidian";
import {
  dirname,
  join
} from "path";
import os from "node:os";
import process from "node:process";

const knownWindowsPackages: Record<string, string> = {
  "win32 arm64 LE": "@esbuild/win32-arm64",
  "win32 ia32 LE": "@esbuild/win32-ia32",
  "win32 x64 LE": "@esbuild/win32-x64"
};
const knownUnixlikePackages: Record<string, string> = {
  "aix ppc64 BE": "@esbuild/aix-ppc64",
  "android arm64 LE": "@esbuild/android-arm64",
  "darwin arm64 LE": "@esbuild/darwin-arm64",
  "darwin x64 LE": "@esbuild/darwin-x64",
  "freebsd arm64 LE": "@esbuild/freebsd-arm64",
  "freebsd x64 LE": "@esbuild/freebsd-x64",
  "linux arm LE": "@esbuild/linux-arm",
  "linux arm64 LE": "@esbuild/linux-arm64",
  "linux ia32 LE": "@esbuild/linux-ia32",
  "linux mips64el LE": "@esbuild/linux-mips64el",
  "linux ppc64 LE": "@esbuild/linux-ppc64",
  "linux riscv64 LE": "@esbuild/linux-riscv64",
  "linux s390x BE": "@esbuild/linux-s390x",
  "linux x64 LE": "@esbuild/linux-x64",
  "linux loong64 LE": "@esbuild/linux-loong64",
  "netbsd x64 LE": "@esbuild/netbsd-x64",
  "openbsd x64 LE": "@esbuild/openbsd-x64",
  "sunos x64 LE": "@esbuild/sunos-x64"
};
const knownWebAssemblyFallbackPackages: Record<string, string> = {
  "android arm LE": "@esbuild/android-arm",
  "android x64 LE": "@esbuild/android-x64"
};

export const ESBUILD_MAIN_PATH = "node_modules/esbuild/lib/main.js";

export async function downloadEsbuild(plugin: Plugin): Promise<void> {
  const app = plugin.app;
  const missingEsbuildFiles: string[] = [ESBUILD_MAIN_PATH];

  const platformKey = `${process.platform} ${os.arch()} ${os.endianness()}`;

  if (platformKey in knownWindowsPackages) {
    missingEsbuildFiles.push(`node_modules/${knownWindowsPackages[platformKey]}/esbuild.exe`);
  } else if (platformKey in knownUnixlikePackages) {
    missingEsbuildFiles.push(`node_modules/${knownUnixlikePackages[platformKey]}/bin/esbuild`);
  } else if (platformKey in knownWebAssemblyFallbackPackages) {
    missingEsbuildFiles.push(`node_modules/${knownWebAssemblyFallbackPackages[platformKey]}/bin/esbuild`);
  } else {
    await showErrorAndDisablePlugin(plugin, `esbuild doesn't support platform ${platformKey}. Disabling the plugin...`);
    return;
  }
  for (const path of missingEsbuildFiles) {
    const fullPath = join(plugin.manifest.dir!, path);
    if (await app.vault.adapter.exists(fullPath)) {
      continue;
    }

    const notice = new Notice("In order to use this plugin, we need to download some esbuild assets. This will only happen once. Please wait...");

    const url = path.replace("node_modules/", "https://unpkg.com/");

    const response = await requestUrl(url);
    if (response.status !== 200) {
      await showErrorAndDisablePlugin(plugin, `Failed to download ${url}. Disabling the plugin...`);
      return;
    }

    const dir = dirname(fullPath);
    if (!await app.vault.adapter.exists(dir)) {
      await app.vault.adapter.mkdir(dir);
    }
    await app.vault.adapter.writeBinary(fullPath, response.arrayBuffer);
    notice.hide();
  }
}

async function showErrorAndDisablePlugin(plugin: Plugin, message: string): Promise<void> {
  new Notice(message);
  console.error(message);
  await plugin.app.plugins.disablePlugin(plugin.manifest.id);
}
