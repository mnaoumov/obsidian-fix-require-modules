import { transform as babelTransform } from '@babel/standalone';

import type { TransformResult } from './BabelPluginBase.ts';

import { BabelPluginBase } from './BabelPluginBase.ts';

type MapDataListToPlugins<DataList extends unknown[]> = {
  [Data in keyof DataList]: BabelPluginBase<DataList[Data]>
};

type TupleToIntersection<T extends readonly unknown[]> =
  T extends [infer Head, ...infer Tail]
    ? Head & TupleToIntersection<Tail>
    : unknown;

abstract class CombineBabelPlugins<DataList extends unknown[]> extends BabelPluginBase<TupleToIntersection<DataList>> {
  public constructor(protected readonly plugins: [...MapDataListToPlugins<DataList>]) {
    super(CombineBabelPlugins.combineData(plugins));
  }

  private static combineData<DataList extends unknown[]>(plugins: [...MapDataListToPlugins<DataList>]): TupleToIntersection<DataList> {
    return Object.assign({}, ...plugins.map((plugin) => plugin.data)) as TupleToIntersection<DataList>;
  }

  protected getCombinedData(): TupleToIntersection<DataList> {
    return CombineBabelPlugins.combineData(this.plugins);
  }
}

export class ParallelBabelPlugin<DataList extends unknown[]> extends CombineBabelPlugins<DataList> {
  public constructor(plugins: [...MapDataListToPlugins<DataList>]) {
    super(plugins);
  }

  public override transform(code: string, filename: string, dir?: string): TransformResult<TupleToIntersection<DataList>> {
    try {
      const result = babelTransform(code, {
        cwd: dir,
        filename,
        plugins: this.plugins.map((plugin) => plugin.getPluginObj()),
        presets: ['typescript'],
        sourceMaps: 'inline'
      });

      if (result.code === null || result.code === undefined) {
        throw new Error('Unknown error');
      }

      return {
        data: this.getCombinedData(),
        transformedCode: result.code
      };
    } catch (e) {
      return {
        data: this.getCombinedData(),
        error: e as Error,
        transformedCode: ''
      };
    }
  }
}

export class SequentialBabelPlugin<DataList extends unknown[]> extends CombineBabelPlugins<DataList> {
  public constructor(plugins: [...MapDataListToPlugins<DataList>]) {
    super(plugins);
  }

  public override transform(code: string, filename: string, dir?: string): TransformResult<TupleToIntersection<DataList>> {
    for (const plugin of this.plugins) {
      const result = plugin.transform(code, filename, dir);

      if (result.error) {
        return {
          data: this.getCombinedData(),
          error: result.error,
          transformedCode: ''
        };
      }
      code = result.transformedCode;
    }

    return {
      data: this.getCombinedData(),
      transformedCode: code
    };
  }
}
