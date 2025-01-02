import { transform } from '@babel/standalone';

interface TransformCodeToCommonJsResult {
  code?: string;
  error?: Error;
  hasTopLevelAwait?: boolean;
}

export function transformToCommonJs(filename: string, code: string): TransformCodeToCommonJsResult {
  try {
    const result = transform(code, {
      ast: true,
      filename,
      plugins: [
        'transform-modules-commonjs'
      ],
      presets: ['typescript']
    });

    if (result.code === null || result.code === undefined) {
      return { error: new Error('Unknown error') };
    }

    return {
      code: result.code,
      hasTopLevelAwait: result.ast?.program.extra?.['topLevelAwait'] as boolean | undefined ?? false
    };
  } catch (e) {
    return { error: e as Error };
  }
}
