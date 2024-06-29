import type {
  App,
  MarkdownPostProcessorContext
} from "obsidian";
import { join } from "node:path";
import { printError } from "./Error.ts";
import babel from "@babel/core";
import babelPluginTransformModulesCommonJS from "@babel/plugin-transform-modules-commonjs";
import babelPresetTypeScript from "@babel/preset-typescript";
import babelPluginFixSourceMap from "./babelPluginFixSourceMap.ts";
import { convertPathToObsidianUrl } from "./CustomRequire.ts";
import babelPluginWrapInDefaultAsyncFunction from "./babelPluginWrapInDefaultAsyncFunction.ts";

type CodeButtonBlockScriptWrapper = () => Promise<void>;

export function processCodeButtonBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext, app: App): void {
  const sectionInfo = ctx.getSectionInfo(el);

  if (sectionInfo) {
    const lines = sectionInfo.text.split("\n");
    const codeBlockHeader = lines[sectionInfo.lineStart]!;
    const caption = codeBlockHeader.slice("```code-button ".length).trim() || "(no caption)";

    el.createEl("button", {
      text: caption,
      cls: "mod-cta",
      async onclick(): Promise<void> {
        resultEl.empty();
        resultEl.setText("Executing...⌛");

        const noteFile = app.vault.getAbstractFileByPath(ctx.sourcePath);
        const dir = noteFile?.parent;
        const dirPath = dir?.path ?? "";
        const randomName = Math.random().toString(36).substring(2, 15);
        const codeButtonBlockScriptFileName = `.code-button-block-script-${randomName}.mts`;
        const codeButtonBlockScriptPath = join(dirPath, codeButtonBlockScriptFileName);
        await app.vault.create(codeButtonBlockScriptPath, source);
        const codeButtonBlockScriptWrapperFileName = `.code-button-block-script-wrapper-${randomName}.cjs`;
        const codeButtonBlockScriptWrapperPath = join(dirPath, codeButtonBlockScriptWrapperFileName);
        const sourceDir = app.vault.adapter.getFullPath(dirPath);
        const sourceUrl = convertPathToObsidianUrl(app.vault.adapter.getFullPath(codeButtonBlockScriptPath));

        try {
          const wrappedCode = await makeWrapperScript(source, codeButtonBlockScriptFileName, sourceDir, sourceUrl);
          await app.vault.create(codeButtonBlockScriptWrapperPath, wrappedCode);
          const codeButtonBlockScriptWrapper = window.require(app.vault.adapter.getFullPath(codeButtonBlockScriptWrapperPath)) as CodeButtonBlockScriptWrapper;
          await codeButtonBlockScriptWrapper();
          resultEl.setText("Done! ✅");
        } catch (error) {
          resultEl.setText("Error! ❌\nSee console for details...");
          printError(new Error("Error executing code block", { cause: error }));
        } finally {
          for (const path of [codeButtonBlockScriptPath, codeButtonBlockScriptWrapperPath]) {
            if (await app.vault.adapter.exists(path)) {
              await app.vault.adapter.remove(path);
            }
          }
        }
      }
    });
  }

  const resultEl = el.createEl("pre");

  if (!sectionInfo) {
    resultEl.textContent = "Error! ❌\nCould not get code block info. Try to reopen the note...";
  }
}

async function makeWrapperScript(source: string, sourceFileName: string, sourceDir: string, sourceUrl: string): Promise<string> {
  let result = await babel.transformAsync(source, {
    cwd: sourceDir,
    presets: [
      babelPresetTypeScript
    ],
    plugins: [
      babelPluginTransformModulesCommonJS
    ],
    filename: sourceFileName,
    sourceMaps: "inline"
  });

  result = await babel.transformAsync(result!.code!, {
    cwd: sourceDir,
    plugins: [
      babelPluginWrapInDefaultAsyncFunction,
      [babelPluginFixSourceMap, { sourceUrl }]
    ],
    filename: sourceFileName,
    sourceMaps: "inline"
  });

  return result!.code!;
}
