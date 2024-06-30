import esbuild from "esbuild";
import process from "node:process";
import builtins from "builtin-modules";
import { existsSync } from "node:fs";
import {
  cp,
  mkdir,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";

interface NpmPackage {
  name: string;
}

export enum BuildMode {
  Development,
  Production
}

export default async function buildPlugin({
  mode,
  obsidianConfigDir = process.env["OBSIDIAN_CONFIG_DIR"]
}:
{
  mode: BuildMode
  obsidianConfigDir?: string
}): Promise<void> {
  const banner = `/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/
`;

  const isProductionBuild = mode === BuildMode.Production;

  const distDir = isProductionBuild ? "dist/build" : "dist/dev";
  if (existsSync(distDir)) {
    await rm(distDir, { recursive: true });
  }
  await mkdir(distDir, { recursive: true });

  const distFileNames = [
    "manifest.json",
    "styles.css"
  ];
  if (!isProductionBuild) {
    await writeFile(`${distDir}/.hotreload`, "", "utf8");
  }

  for (const fileName of distFileNames) {
    const localFile = `./${fileName}`;
    const distFile = `${distDir}/${fileName}`;

    if (existsSync(localFile)) {
      await cp(localFile, distFile);
    }
  }

  const distPath = `${distDir}/main.js`;

  const context = await esbuild.context({
    banner: {
      js: banner,
    },
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: [
      "esbuild",
      "obsidian",
      "electron",
      "@codemirror/autocomplete",
      "@codemirror/collab",
      "@codemirror/commands",
      "@codemirror/language",
      "@codemirror/lint",
      "@codemirror/search",
      "@codemirror/state",
      "@codemirror/view",
      "@lezer/common",
      "@lezer/highlight",
      "@lezer/lr",
      ...builtins],
    format: "cjs",
    target: "es2018",
    logLevel: "info",
    sourcemap: isProductionBuild ? false : "inline",
    treeShaking: true,
    outfile: distPath,
    platform: "node",
    plugins: [
      {
        name: "preprocess",
        setup(build): void {
          build.onLoad({ filter: /\.(js|ts|cjs|mjs|cts|mts)$/ }, async (args) => {
            let contents = await readFile(args.path, "utf8");
            contents = contents.replace(/import\.meta\.url/g, "__filename");
            // HACK: The ${""} part is used to ensure Obsidian loads the plugin properly otherwise it stops loading it after the first line of the sourceMappingURL comment.
            contents = contents.replace(/\`\r?\n\/\/# sourceMappingURL/g, "`\n//#${\"\"} sourceMappingURL");

            return {
              contents,
              loader: "ts"
            };
          });
        },
      },
      {
        name: "fix-require-esbuild",
        setup(build): void {
          build.onEnd(async () => {
            let contents = await readFile(distPath, "utf8");
            const esbuildReplaceString = String.raw`(process.env["ESBUILD_WORKER_THREADS"] = "0", require("path").join(window.app.vault.adapter.getBasePath(), window.app.vault.configDir, "plugins/fix-require-modules/node_modules/esbuild/lib/main.js"))`;
            contents = contents.replace(/require\("esbuild"\)/g, `require(${esbuildReplaceString})`);
            await writeFile(distPath, contents, "utf8");
          });
        },
      },
      {
        name: "copy-to-obsidian-plugins-folder",
        setup(build): void {
          build.onEnd(async () => {
            if (isProductionBuild || !obsidianConfigDir) {
              return;
            }

            const npmPackage = JSON.parse(await readFile("./package.json", "utf8")) as NpmPackage;
            const pluginName = npmPackage.name;
            const pluginDir = `${obsidianConfigDir}/plugins/${pluginName}`;
            if (!existsSync(pluginDir)) {
              await mkdir(pluginDir);
            }

            await cp(distDir, pluginDir, { recursive: true });
          });
        }
      }
    ]
  });

  if (isProductionBuild) {
    await context.rebuild();
  } else {
    await context.watch();
  }
}
