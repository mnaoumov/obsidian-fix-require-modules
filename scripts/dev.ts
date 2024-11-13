import { wrapCliTask } from 'obsidian-dev-utils/scripts/CliUtils';
import {
  BuildMode,
  buildObsidianPlugin
} from 'obsidian-dev-utils/scripts/esbuild/ObsidianPluginBuilder';
import { resolvePathFromRoot } from 'obsidian-dev-utils/scripts/Root';

import { fixRequireEsbuildPlugin } from './fixRequireEsbuildPlugin.ts';

await wrapCliTask(async () => {
  return await buildObsidianPlugin({
    customEsbuildPlugins: [
      fixRequireEsbuildPlugin(resolvePathFromRoot('dist/dev/main.js'))
    ],
    mode: BuildMode.Development
  });
});
