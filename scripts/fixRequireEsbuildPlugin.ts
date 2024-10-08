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
      build.initialOptions.banner['js'] = `${jsBanner}\nvar _requireEsbuild = ${_requireEsbuild.toString().replace('<% npmPackage.name %>', npmPackage.name)};\n`;

      build.onEnd(async () => {
        let contents = await readFile(distPath, 'utf-8');
        contents = contents.replaceAll('require("esbuild")', '_requireEsbuild()');
        await writeFile(distPath, contents, 'utf-8');
      });

      function _requireEsbuild(): unknown {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        const app = window.app;
        const adapter = app.vault.adapter;
        const esbuildPath = adapter.path.join(adapter.getBasePath(), app.vault.configDir, 'plugins', '<% npmPackage.name %>', 'node_modules/esbuild/lib/main.js');
        if (adapter.fs?.existsSync(esbuildPath)) {
          process.env['ESBUILD_WORKER_THREADS'] = '0';
          return window.require(esbuildPath);
        }

        console.warn('esbuild not found, the plugin will download it shortly and reload itself');
        return {};
      }
    }
  };
}
