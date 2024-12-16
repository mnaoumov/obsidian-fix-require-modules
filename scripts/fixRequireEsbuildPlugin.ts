import type { Plugin } from 'esbuild';
import type { FileSystemAdapter } from 'obsidian';

import {
  readFile,
  writeFile
} from 'obsidian-dev-utils/scripts/NodeModules';
import { readPackageJson } from 'obsidian-dev-utils/scripts/Npm';

export function fixRequireEsbuildPlugin(distPath: string): Plugin {
  return {
    name: 'fix-require-esbuild',
    async setup(build): Promise<void> {
      const packageJson = await readPackageJson();
      build.initialOptions.banner ??= {};
      const jsBanner = build.initialOptions.banner['js'] ?? '';
      build.initialOptions.banner['js'] = `${jsBanner}\nvar _requireEsbuild = ${_requireEsbuild.toString().replace('<% npmPackage.name %>', packageJson.name ?? '')};\n`;

      build.onEnd(async () => {
        let contents = await readFile(distPath, 'utf-8');
        contents = contents.replaceAll('require("esbuild")', '_requireEsbuild()');
        await writeFile(distPath, contents, 'utf-8');
      });

      function _requireEsbuild(): unknown {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        const app = window.app;
        const adapter = app.vault.adapter as FileSystemAdapter;
        const esbuildPath = adapter.path.join(adapter.basePath, app.vault.configDir, 'plugins', '<% npmPackage.name %>', 'node_modules/esbuild/lib/main.js');
        if (adapter.fs.existsSync(esbuildPath)) {
          process.env['ESBUILD_WORKER_THREADS'] = '0';
          return window.require(esbuildPath);
        }

        console.warn('esbuild not found, the plugin will download it shortly and reload itself');
        return {};
      }
    }
  };
}
