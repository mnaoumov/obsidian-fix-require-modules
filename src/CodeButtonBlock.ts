import type {
  App,
  MarkdownPostProcessorContext,
  PluginManifest
} from 'obsidian';
import type { MaybePromise } from 'obsidian-dev-utils/Async';

import {
  MarkdownRenderer,
  Plugin
} from 'obsidian';
import { invokeAsyncSafely } from 'obsidian-dev-utils/Async';
import { printError } from 'obsidian-dev-utils/Error';
import { getCodeBlockArguments } from 'obsidian-dev-utils/obsidian/MarkdownCodeBlockProcessor';
import {
  basename,
  dirname
} from 'obsidian-dev-utils/Path';

import { SequentialBabelPlugin } from './babel/CombineBabelPlugins.ts';
import { ConvertToCommonJsBabelPlugin } from './babel/ConvertToCommonJsBabelPlugin.ts';
import { WrapForCodeBlockBabelPlugin } from './babel/WrapForCodeBlockBabelPlugin.ts';
import { ConsoleWrapper } from './ConsoleWrapper.ts';
import { requireStringAsync } from './RequireHandlerUtils.ts';

type CodeButtonBlockScriptWrapper = (registerTempPlugin: RegisterTempPluginFn, console: Console, container: HTMLElement, renderMarkdown: (markdown: string) => Promise<void>) => MaybePromise<void>;
type RegisterTempPluginFn = (tempPluginClass: TempPluginClass) => void;

type TempPluginClass = new (app: App, manifest: PluginManifest) => Plugin;

const CODE_BUTTON_BLOCK_LANGUAGE = 'code-button';
const tempPlugins = new Map<string, Plugin>();

interface HandleClickOptions {
  buttonIndex: number;
  caption: string;
  plugin: Plugin;
  resultEl: HTMLElement;
  shouldAutoOutput: boolean;
  shouldShowSystemMessages: boolean;
  shouldWrapConsole: boolean;
  source: string;
  sourcePath: string;
}

export function registerCodeButtonBlock(plugin: Plugin): void {
  registerCodeHighlighting();
  plugin.register(unregisterCodeHighlighting);
  plugin.registerMarkdownCodeBlockProcessor(CODE_BUTTON_BLOCK_LANGUAGE,
    (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void => { processCodeButtonBlock(plugin, source, el, ctx); }
  );
}

export function unloadTempPlugins(): void {
  for (const tempPlugin of tempPlugins.values()) {
    tempPlugin.unload();
  }
}

async function handleClick(options: HandleClickOptions): Promise<void> {
  options.resultEl.empty();
  const wrappedConsole = new ConsoleWrapper(options.resultEl);
  if (options.shouldShowSystemMessages) {
    wrappedConsole.writeSystemMessage('⏳ Executing...');
  }

  try {
    const script = makeWrapperScript(options.source, `${basename(options.sourcePath)}.code-button.${options.buttonIndex.toString()}.${options.caption}.ts`, dirname(options.sourcePath), options.shouldAutoOutput);
    const codeButtonBlockScriptWrapper = await requireStringAsync(script, options.plugin.app.vault.adapter.getFullPath(options.sourcePath).replaceAll('\\', '/'), `code-button:${options.buttonIndex.toString()}:${options.caption}`) as CodeButtonBlockScriptWrapper;
    await codeButtonBlockScriptWrapper(makeRegisterTempPluginFn(options.plugin), wrappedConsole.getConsoleInstance(options.shouldWrapConsole), options.resultEl, makeRenderMarkdownFn(options.plugin, options.resultEl, options.sourcePath));
    if (options.shouldShowSystemMessages) {
      wrappedConsole.writeSystemMessage('✔ Executed successfully');
    }
  } catch (error) {
    printError(error);
    wrappedConsole.appendToResultEl([error], 'error');
    if (options.shouldShowSystemMessages) {
      wrappedConsole.writeSystemMessage('✖ Executed with error!');
    }
  }
}

function makeRegisterTempPluginFn(plugin: Plugin): RegisterTempPluginFn {
  return (tempPluginClass) => {
    registerTempPlugin(plugin, tempPluginClass);
  };
}

function makeRenderMarkdownFn(plugin: Plugin, resultEl: HTMLElement, sourcePath: string): (markdown: string) => Promise<void> {
  return async (markdown: string) => {
    await MarkdownRenderer.render(plugin.app, markdown, resultEl, sourcePath, plugin);
  };
}

function makeWrapperScript(source: string, sourceFileName: string, sourceDir: string, shouldAutoOutput: boolean): string {
  const result = new SequentialBabelPlugin([
    new ConvertToCommonJsBabelPlugin(),
    new WrapForCodeBlockBabelPlugin(shouldAutoOutput)
  ]).transform(source, sourceFileName, sourceDir);

  if (result.error) {
    throw result.error;
  }

  return result.transformedCode;
}

function processCodeButtonBlock(plugin: Plugin, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
  const sectionInfo = ctx.getSectionInfo(el);
  const resultEl = el.createDiv({ cls: 'console-log-container' });

  if (sectionInfo) {
    const [
      caption = '(no caption)',
      ...rest
    ] = getCodeBlockArguments(ctx, el);

    const shouldAutoRun = rest.includes('autorun') || rest.includes('autorun:true');
    const shouldWrapConsole = !rest.includes('console:false');
    const shouldAutoOutput = !rest.includes('autoOutput:false');
    const shouldShowSystemMessages = !rest.includes('systemMessages:false');

    const lines = sectionInfo.text.split('\n');
    const previousLines = lines.slice(0, sectionInfo.lineStart);
    const previousText = previousLines.join('\n');
    const buttonIndex = Array.from(previousText.matchAll(new RegExp(`^\`{3,}${CODE_BUTTON_BLOCK_LANGUAGE}`, 'gm'))).length;

    const handleClickOptions: HandleClickOptions = {
      buttonIndex,
      caption,
      plugin,
      resultEl,
      shouldAutoOutput,
      shouldWrapConsole,
      shouldShowSystemMessages,
      source,
      sourcePath: ctx.sourcePath
    };

    el.createEl('button', {
      cls: 'mod-cta',
      async onclick(): Promise<void> {
        await handleClick(handleClickOptions);
      },
      prepend: true,
      text: caption
    });

    if (shouldAutoRun) {
      invokeAsyncSafely(() => handleClick(handleClickOptions));
    }
  }

  if (!sectionInfo) {
    new ConsoleWrapper(resultEl).writeSystemMessage('✖ Error!\nCould not get code block info. Try to reopen the note...');
  }
}

function registerCodeHighlighting(): void {
  window.CodeMirror.defineMode(CODE_BUTTON_BLOCK_LANGUAGE, (config) => window.CodeMirror.getMode(config, 'text/typescript'));
}

function registerTempPlugin(plugin: Plugin, tempPluginClass: TempPluginClass): void {
  const app = plugin.app;
  const id = `__temp-plugin-${tempPluginClass.name}`;

  const existingPlugin = tempPlugins.get(id);
  if (existingPlugin) {
    existingPlugin.unload();
  }

  const tempPlugin = new tempPluginClass(app, {
    author: '__Temp Plugin created by Fix Require Modules',
    description: '__Temp Plugin created by Fix Require Modules',
    id,
    minAppVersion: '0.0.1',
    name: '__Temp Plugin ${name}',
    version: '0.0.0'
  });

  const unloadCommandId = `unload-temp-plugin-${tempPluginClass.name}`;

  tempPlugin.register(() => {
    tempPlugins.delete(id);
    plugin.removeCommand(unloadCommandId);
    new Notice(`Unloaded Temp Plugin: ${tempPluginClass.name}`);
  });

  tempPlugins.set(id, tempPlugin);
  plugin.addChild(tempPlugin);
  new Notice(`Loaded Temp Plugin: ${tempPluginClass.name}`);

  plugin.addCommand({
    callback: () => {
      tempPlugin.unload();
    },
    id: unloadCommandId,
    name: `Unload Temp Plugin: ${tempPluginClass.name}`
  });
}

function unregisterCodeHighlighting(): void {
  window.CodeMirror.defineMode(CODE_BUTTON_BLOCK_LANGUAGE, (config) => window.CodeMirror.getMode(config, 'null'));
}
