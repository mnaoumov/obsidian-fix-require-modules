import { wrapCliTask } from "obsidian-dev-utils/bin/cli";
import {
  buildObsidianPlugin,
  BuildMode
} from "obsidian-dev-utils/bin/esbuild/ObsidianPluginBuilder"
import { fixRequireEsbuildPlugin } from "./fixRequireEsbuildPlugin.ts";
import { resolvePathFromRoot } from "obsidian-dev-utils/Root";

await wrapCliTask(async () => {
  return await buildObsidianPlugin({
    mode: BuildMode.Development,
    customEsbuildPlugins: [
      fixRequireEsbuildPlugin(resolvePathFromRoot("dist/dev/main.js"))
    ]
  });
});
