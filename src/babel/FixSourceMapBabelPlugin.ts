import type { PluginPass } from '@babel/core';
import type { Visitor } from '@babel/traverse';

import { BabelPluginBase } from './BabelPluginBase.ts';

interface FixSourceMapData {
  sourceUrl: string;
}

interface InputMap {
  sourcemap: SourceMap;
}

interface SourceMap {
  sources: string[];
}

export class FixSourceMapBabelPlugin extends BabelPluginBase<FixSourceMapData> {
  public constructor(sourceUrl: string) {
    super({
      sourceUrl
    });
  }

  public override getVisitor(): Visitor<PluginPass> {
    return {
      Program: (_path, state): void => {
        const inputMap = state.file.inputMap as InputMap;
        inputMap.sourcemap.sources[0] = this.data.sourceUrl;
      }
    };
  }
}
