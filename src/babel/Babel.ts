import { transform, availablePlugins } from '@babel/standalone';
import type { BabelFile, PluginObj, PluginPass, Visitor } from '@babel/core';

export function transformToCommonJs(filename: string, code: string): RunPluginResult<{ hasTopLevelAwait: boolean }> {
  const plugin = new TransformCodeToCommonJsPlugin();
  return plugin.run(code, filename);
}

type PluginPassWrapper<Opts> = PluginPass & { opts: Opts; };

export abstract class BabelPluginRunner<Opts extends object = {}> {
  protected abstract createOpts(): Opts;

  public abstract visitor: Visitor<PluginPassWrapper<Opts>>;
  public name?: string | undefined;

  public manipulateOptions?: (opts: unknown, parserOpts: unknown) => void;
  public pre?: (this: PluginPassWrapper<Opts>, file: BabelFile) => void;
  public post?: (this: PluginPassWrapper<Opts>, file: BabelFile) => void;
  public inherits?: unknown;

  public run(code: string, filename: string): RunPluginResult<Opts> {
    const opts = this.createOpts();
    try {
      const result = transform(code, {
        filename,
        plugins: [
          [this as PluginObj<PluginPassWrapper<Opts>>, opts]
        ],
        presets: ['typescript'],
        sourceMaps: 'inline'
      });

      if (result.code === null || result.code === undefined) {
        throw new Error('Unknown error');
      }

      return {
        opts,
        transformedCode: result.code
      };
    } catch (e) {
      return {
        error: e as Error,
        opts: opts,
        transformedCode: ''
      };
    }
  }
}

interface RunPluginResult<Opts extends object = {}> {
  transformedCode: string;
  error?: Error;
  opts: Opts;
}

class TransformCodeToCommonJsPlugin extends BabelPluginRunner<{ hasTopLevelAwait: boolean }> {
  public override visitor: Visitor<PluginPassWrapper<{ hasTopLevelAwait: boolean }>> = (availablePlugins['transform-modules-commonjs'] as PluginObj).visitor;

  public override post: (this: PluginPassWrapper<{ hasTopLevelAwait: boolean }>, file: BabelFile) => void = function (file) {
    this.opts.hasTopLevelAwait = file.ast.program.extra?.['topLevelAwait'] as boolean | undefined ?? false;
  }

  public override createOpts(): { hasTopLevelAwait: boolean } {
    return { hasTopLevelAwait: false };
  }
}
