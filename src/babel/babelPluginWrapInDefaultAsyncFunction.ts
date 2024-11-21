import type {
  NodePath,
  PluginObj
} from '@babel/core';
import type { Program } from '@babel/types';

import {
  assignmentExpression,
  blockStatement,
  expressionStatement,
  functionExpression,
  identifier,
  memberExpression
} from '@babel/types';

export const babelPluginWrapInDefaultAsyncFunction: PluginObj = {
  name: 'wrap-in-default-async-function',
  visitor: {
    Program(path: NodePath<Program>) {
      const programBody = path.node.body;
      const wrapperFunction = functionExpression(
        identifier('codeButtonBlockScriptWrapper'),
        [],
        blockStatement(programBody),
        false,
        true
      );

      const moduleExports = expressionStatement(
        assignmentExpression(
          '=',
          memberExpression(identifier('module'), identifier('exports')),
          wrapperFunction
        )
      );

      path.node.body = [moduleExports];
    }
  }
};
