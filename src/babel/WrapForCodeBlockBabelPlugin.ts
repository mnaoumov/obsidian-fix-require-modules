import type { PluginPass } from '@babel/core';
import type { Visitor } from '@babel/traverse';

import {
  assignmentExpression,
  blockStatement,
  expressionStatement,
  functionExpression,
  identifier,
  memberExpression
} from '@babel/types';

import { BabelPluginBase } from './BabelPluginBase.ts';

export class WrapForCodeBlockBabelPlugin extends BabelPluginBase {
  public constructor() {
    super({});
  }

  public override getVisitor(): Visitor<PluginPass> {
    return {
      Program(path): void {
        const programBody = path.node.body;
        const wrapperFunction = functionExpression(
          identifier('codeButtonBlockScriptWrapper'),
          [
            identifier('registerTempPlugin'),
            identifier('console')
          ],
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
    };
  }
}
