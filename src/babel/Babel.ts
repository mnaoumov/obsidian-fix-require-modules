import { transform } from '@babel/standalone';

import { babelPluginDetectTopLevelAwait } from './babelPluginDetectTopLevelAwait.ts';

interface TransformCodeToCommonJsResult {
  code?: string;
  error?: Error;
  hasTopLevelAwait?: boolean;
}

export function transformToCommonJs(filename: string, code: string): TransformCodeToCommonJsResult {
  try {
    let result = transform(code, {
      filename,
      plugins: [
        'transform-modules-commonjs'
      ],
      presets: ['typescript']
    });

    if (!result.code) {
      return { error: new Error('Unknown error') };
    }

    const hasTopLevelAwaitWrapper = {
      hasTopLevelAwait: false
    };

    result = transform(result.code, {
      plugins: [
        [babelPluginDetectTopLevelAwait, hasTopLevelAwaitWrapper]
      ]
    });

    if (!result.code) {
      return { error: new Error('Unknown error') };
    }

    return {
      code: result.code,
      hasTopLevelAwait: hasTopLevelAwaitWrapper.hasTopLevelAwait
    };
  } catch (e) {
    return { error: e as Error };
  }
}
