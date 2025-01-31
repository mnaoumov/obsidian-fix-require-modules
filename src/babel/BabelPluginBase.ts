import type {
  BabelFile,
  PluginObj,
  PluginPass
} from '@babel/core';
import type { Visitor } from '@babel/traverse';

import { transform as babelTransform } from '@babel/standalone';
import { noop } from 'obsidian-dev-utils/Function';

export interface TransformResult<Data> {
  data: Data;
  error?: Error;
  transformedCode: string;
}

export abstract class BabelPluginBase<Data = unknown> {
  protected constructor(public readonly data: Data) {
    noop();
  }

  public getInherits(): unknown {
    return undefined;
  }

  public getVisitor(): Visitor<PluginPass> {
    noop();
    return {};
  }

  public manipulateOptions(_opts: unknown, _parserOpts: unknown): void {
    noop();
  }

  public post(_state: PluginPass, _file: BabelFile): void {
    noop();
  }

  public pre(_state: PluginPass, _file: BabelFile): void {
    noop();
  }

  public transform(code: string, filename: string, dir?: string): TransformResult<Data> {
    try {
      const result = babelTransform(code, {
        cwd: dir,
        filename,
        plugins: [
          this.getPluginObj()
        ],
        presets: ['typescript'],
        sourceMaps: 'inline'
      });

      if (result.code === null || result.code === undefined) {
        throw new Error('Unknown error');
      }

      return {
        data: this.data,
        transformedCode: result.code
      };
    } catch (e) {
      return {
        data: this.data,
        error: e as Error,
        transformedCode: ''
      };
    }
  }

  private getPluginObj(): PluginObj {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this;
    const visitor = this.getVisitor();
    const inherits = this.getInherits();

    function manipulateOptions(opts: unknown, parserOpts: unknown): void {
      that.manipulateOptions(opts, parserOpts);
    }

    function pre(this: PluginPass, file: BabelFile): void {
      that.pre(this, file);
    }

    function post(this: PluginPass, file: BabelFile): void {
      that.post(this, file);
    }

    return {
      inherits,
      manipulateOptions,
      post,
      pre,
      visitor
    };
  }
}
