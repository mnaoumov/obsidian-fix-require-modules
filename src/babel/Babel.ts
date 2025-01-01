import { transform } from '@babel/standalone';

import { babelPluginDetectTopLevelAwait } from './babelPluginDetectTopLevelAwait.ts';

interface TransformCodeToCommonJsResult {
  code?: string;
  hasTopLevelAwait?: boolean;
}

export function transformToCommonJs(filename: string, code: string): TransformCodeToCommonJsResult {
  let result = transform(code, {
    filename,
    plugins: [
      'transform-modules-commonjs'
    ],
    presets: ['typescript']
  });

  if (!result.code) {
    return {};
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
    return {};
  }

  return {
    code: result.code,
    hasTopLevelAwait: hasTopLevelAwaitWrapper.hasTopLevelAwait
  };
}
