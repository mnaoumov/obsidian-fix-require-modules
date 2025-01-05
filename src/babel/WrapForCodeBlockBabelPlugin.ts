import type { PluginPass } from '@babel/core';
import type { Visitor } from '@babel/traverse';
import type {
  Expression,
  Statement
} from '@babel/types';

import {
  assignmentExpression,
  blockStatement,
  callExpression,

  expressionStatement,
  functionExpression,
  identifier,
  isExpressionStatement,
  isReturnStatement,
  memberExpression,
  nullLiteral
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

        const lastStatement = programBody.pop();
        let lastStatementExpression = convertToExpression(lastStatement);

        if (!lastStatementExpression) {
          if (lastStatement) {
            programBody.push(lastStatement);
          }

          lastStatementExpression = identifier('undefined');
        }

        const newLastStatement = expressionStatement(callExpression(
          memberExpression(
            identifier('console'),
            identifier('log')
          ),
          [
            lastStatementExpression
          ]
        ));

        programBody.push(newLastStatement);

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
function convertToExpression(statement: Statement | undefined): Expression | null {
  if (!statement) {
    return identifier('undefined');
  }

  if (isExpressionStatement(statement)) {
    return statement.expression;
  }

  if (isReturnStatement(statement)) {
    if (statement.argument) {
      return statement.argument;
    }

    if (statement.argument === null) {
      return nullLiteral();
    }
  }

  return null;
}
