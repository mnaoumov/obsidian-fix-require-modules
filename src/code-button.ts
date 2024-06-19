import type {
  App,
  MarkdownPostProcessorContext
} from "obsidian";
import { join } from "node:path";
import { printError } from "./Error.ts";

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
        const code = `export default async function(): Promise<void> {
${source}
};`;
        const noteFile = app.vault.getAbstractFileByPath(ctx.sourcePath);
        const dir = noteFile?.parent;
        const randomFileName = Math.random().toString(36).substring(2, 15);
        const scriptPath = join(dir?.path ?? "", `.${randomFileName}.ts`);
        await app.vault.create(scriptPath, code);
        try {
          const esmModule = window.require(app.vault.adapter.getFullPath(scriptPath)) as DefaultEsmModule;
          await esmModule.default();
          resultEl.setText("Done! ✅");
        } catch (error) {
          resultEl.setText("Error! ❌\nSee console for details...");
          printError(new Error("Error executing code block", { cause: error }));
        } finally {
          await app.vault.adapter.remove(scriptPath);
        }
      }
    });
  }

  const resultEl = el.createEl("pre");

  if (!sectionInfo) {
    resultEl.textContent = "Error! ❌\nCould not get code block info. Try to reopen the note...";
  }
}
