import type { PluginPass } from '@babel/core';
import type { Visitor } from '@babel/traverse';
import type { Statement } from '@babel/types';

import {
  blockStatement,
  callExpression,
  expressionStatement,
  functionExpression,
  identifier,
  returnStatement

} from '@babel/types';

import { BabelPluginBase } from './BabelPluginBase.ts';

export class WrapInRequireFunctionBabelPlugin extends BabelPluginBase {
  public constructor(private readonly isAsync: boolean) {
    super({});
  }

  public override getVisitor(): Visitor<PluginPass> {
    return {
      Program: (path): void => {
        const programBody = path.node.body;

        let wrapperBody: Statement[] = [];

        if (this.isAsync) {
          wrapperBody = [
            returnStatement(callExpression(
              identifier('requireAsyncWrapper'),
              [
                functionExpression(
                  identifier('requireFn'),
                  [
                    identifier('require')
                  ],
                  blockStatement(programBody),
                  false,
                  true
                )
              ]
            ))
          ];
        } else {
          wrapperBody = programBody;
        }

        const wrapperFunction = functionExpression(
          identifier('scriptWrapper'),
          [
            identifier('require'),
            identifier('module'),
            identifier('exports')
          ],
          blockStatement(wrapperBody),
          false,
          false
        );

        path.node.body = [expressionStatement(wrapperFunction)];
      }
    };
  }
}
