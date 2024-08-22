import type { Plugin } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { readNpmPackage } from "obsidian-dev-utils/Npm"

export function fixRequireEsbuildPlugin(distPath: string): Plugin {
  return {
    name: "fix-require-esbuild",
    setup(build): void {
      build.onEnd(async () => {
        const npmPackage = await readNpmPackage();

        let contents = await readFile(distPath, "utf8");
        const esbuildReplaceString = `(() => {
const { join } = require("node:path");
const { existsSync } = require("node:fs");
const vault = window.app.vault;
const esbuildPath = join(vault.adapter.getBasePath(), vault.configDir, "plugins/${npmPackage.name}/node_modules/esbuild/lib/main.js");
if (existsSync(esbuildPath)) {
  process.env["ESBUILD_WORKER_THREADS"] = "0";
  return require(esbuildPath);
}
return {};
})()`;
        contents = contents.replaceAll("require(\"esbuild\")", esbuildReplaceString);
        await writeFile(distPath, contents, "utf-8");
      });
    }
  }
}
