import { wrapCliTask } from "obsidian-dev-utils/cli";
import {
  buildObsidianPlugin,
  BuildMode
} from "obsidian-dev-utils/bin/esbuild/ObsidianPluginBuilder";
import { fixRequireEsbuildPlugin } from "./fixRequireEsbuildPlugin.ts";
import { resolvePathFromRoot } from "obsidian-dev-utils/Root";

await wrapCliTask(async () => {
  return await buildObsidianPlugin({
    mode: BuildMode.Production,
    customEsbuildPlugins: [
      fixRequireEsbuildPlugin(resolvePathFromRoot("dist/build/main.js"))
    ]
  });
});
