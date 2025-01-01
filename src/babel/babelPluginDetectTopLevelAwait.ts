import type {
  NodePath,
  PluginObj,
  PluginPass
} from '@babel/core';
import type { Program } from '@babel/types';

import {
  isAwaitExpression,
  isExpressionStatement
} from '@babel/types';

interface PluginState extends PluginPass {
  opts: { hasTopLevelAwait: boolean };
}

export const babelPluginDetectTopLevelAwait: PluginObj<PluginState> = {
  name: 'detect-top-level-await',
  visitor: {
    Program(path: NodePath<Program>, state: PluginState) {
      const programBody = path.node.body;
      for (const node of programBody) {
        if (isExpressionStatement(node) && isAwaitExpression(node.expression)) {
          state.opts.hasTopLevelAwait = true;
          return;
        }
      }
    }
  }
};
