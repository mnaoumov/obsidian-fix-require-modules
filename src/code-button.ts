import type {
  App,
  MarkdownPostProcessorContext
} from "obsidian";
import { join } from "node:path";
import { errorToString } from "./Error.ts";

type DefaultEsmModule = { default(): Promise<unknown> };

export function processCodeButtonBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext, app: App): void {
  const sectionInfo = ctx.getSectionInfo(el);

  if (sectionInfo) {
    const lines = sectionInfo.text.split("\n");
    const codeBlockHeader = lines[sectionInfo.lineStart]!;
    const caption = codeBlockHeader.slice("```code-button ".length).trim();

    el.createEl("button", {
      text: caption,
      cls: "mod-cta",
      async onclick(): Promise<void> {
        resultEl.empty();
        resultEl.setText("Executing...⌛");
        const code = `export default async function(): Promise<unknown> {
${source}
};`;
        const noteFile = app.vault.getAbstractFileByPath(ctx.sourcePath);
        const dir = noteFile?.parent;
        const randomFileName = Math.random().toString(36).substring(2, 15);
        const scriptPath = join(dir?.path ?? "", `.${randomFileName}.ts`);
        await app.vault.create(scriptPath, code);
        try {
          const esmModule = window.require(`/${scriptPath}`) as DefaultEsmModule;
          const result = await esmModule.default();
          resultEl.setText(`Result: ${stringify(result)}`);
        } catch (error) {
          resultEl.setText(errorToString(error));
        }
        finally {
          await app.vault.delete(app.vault.getAbstractFileByPath(scriptPath)!);
        }
      }
    });
  }

  const resultEl = el.createEl("pre");

  if (!sectionInfo) {
    resultEl.textContent = "Error: Could not get code block info.";
  }
}

function stringify(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return errorToString(value);
  }

  return JSON.stringify(value, null, 2);
}
