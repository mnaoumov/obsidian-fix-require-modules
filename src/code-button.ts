import type {
  App,
  MarkdownPostProcessorContext
} from "obsidian";
import { join } from "node:path";
import { printError } from "./Error.ts";
import babel from "@babel/core";
import babelPluginTransformModulesCommonJS from "@babel/plugin-transform-modules-commonjs";
import babelPresetTypeScript from "@babel/preset-typescript";
import fixSourceMapPlugin from "./fixSourceMapPlugin.ts";

type DefaultEsmModule = { default(): Promise<void> };

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
        const randomName = Math.random().toString(36).substring(2, 15);
        const randomFileName = `.${randomName}.ts`;
        const scriptPath = join(dir?.path ?? "", randomFileName);

        try {
          const code = `export default async function scriptWrapper(): Promise<void> {
${await convertToCommonJs(source)}
};`

          await app.vault.create(scriptPath, code);
          const defaultEsModule = window.require(app.vault.adapter.getFullPath(scriptPath)) as DefaultEsmModule;
          await defaultEsModule.default();
          resultEl.setText("Done! ✅");
        } catch (error) {
          resultEl.setText("Error! ❌\nSee console for details...");
          printError(new Error("Error executing code block", { cause: error }));
        } finally {
          if (await app.vault.adapter.exists(scriptPath)) {
            await app.vault.adapter.remove(scriptPath);
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

async function convertToCommonJs(code: string): Promise<string> {
  let result = await babel.transformAsync(code, {
    presets: [
      babelPresetTypeScript
    ],
    plugins: [
      babelPluginTransformModulesCommonJS
    ],
    filename: "(code-button block script).ts",
    sourceMaps: "inline"
  });

  result = await babel.transformAsync(result!.code!, {
    plugins: [
      [fixSourceMapPlugin, { code }]
    ],
    filename: "(code-button block script).ts",
    sourceMaps: "inline"
  });

  return result!.code!;
}
