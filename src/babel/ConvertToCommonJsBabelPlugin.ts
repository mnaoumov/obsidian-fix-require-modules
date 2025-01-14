import { transform as babelTransform } from '@babel/standalone';
import babelPluginTransformImportMeta from 'babel-plugin-transform-import-meta';

import type { TransformResult } from './BabelPluginBase.ts';

import { BabelPluginBase } from './BabelPluginBase.ts';

interface TransformCodeToCommonJsData {
  hasTopLevelAwait: boolean;
}

export class ConvertToCommonJsBabelPlugin extends BabelPluginBase<TransformCodeToCommonJsData> {
  public constructor() {
    super({ hasTopLevelAwait: false });
  }

  public override transform(code: string, filename: string, dir?: string): TransformResult<TransformCodeToCommonJsData> {
    try {
      const result = babelTransform(code, {
        ast: true,
        cwd: dir,
        filename,
        plugins: [
          'transform-modules-commonjs',
          [babelPluginTransformImportMeta(), { module: 'ES6' }]
        ],
        presets: ['typescript'],
        sourceMaps: 'inline'
      });

      return {
        data: {
          hasTopLevelAwait: result.ast?.program.extra?.['topLevelAwait'] as boolean | undefined ?? false
        },
        transformedCode: result.code ?? ''
      };
    } catch (e) {
      return {
        data: {
          hasTopLevelAwait: false
        },
        error: e as Error,
        transformedCode: ''
      };
    }
  }
}
