import type { Plugin } from 'esbuild';
import {
  readFile,
  writeFile
} from 'obsidian-dev-utils/scripts/NodeModules';
import { readNpmPackage } from 'obsidian-dev-utils/scripts/Npm';

export function fixRequireEsbuildPlugin(distPath: string): Plugin {
  return {
    name: 'fix-require-esbuild',
    async setup(build): Promise<void> {
      const npmPackage = await readNpmPackage();
      build.initialOptions.banner ??= {};
      const jsBanner = build.initialOptions.banner['js'] ?? '';
      build.initialOptions.banner['js'] = `${jsBanner}

var _requireEsbuild = () => {
  const { join } = require("node:path");
  const { existsSync } = require("node:fs");
  const vault = window.app.vault;
  const esbuildPath = join(vault.adapter.getBasePath(), vault.configDir, "plugins/${npmPackage.name}/node_modules/esbuild/lib/main.js");
  if (existsSync(esbuildPath)) {
    process.env["ESBUILD_WORKER_THREADS"] = "0";
    return require(esbuildPath);
  }

  console.warn('esbuild not found, the plugin will download it shortly and reload itself');
  return {};
};
`;

      build.onEnd(async () => {
        let contents = await readFile(distPath, 'utf-8');
        contents = contents.replaceAll('require("esbuild")', '_requireEsbuild()');
        await writeFile(distPath, contents, 'utf-8');
      });
    }
  };
}
