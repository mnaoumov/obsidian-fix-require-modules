import type {
  NodePath,
  PluginObj,
  PluginPass
} from '@babel/core';
import type { Program } from '@babel/types';

import type { SourceMap } from '../util/types.js';

interface FixSourceMapPluginState extends PluginPass {
  opts: { sourceUrl: string };
}

interface InputMap {
  sourcemap: SourceMap;
}

export const babelPluginFixSourceMap: PluginObj<FixSourceMapPluginState> = {
  name: 'fix-source-map',
  visitor: {
    Program(_: NodePath<Program>, state: FixSourceMapPluginState): void {
      const inputMap = state.file.inputMap as InputMap;
      inputMap.sourcemap.sources[0] = state.opts.sourceUrl;
    }
  }
};
