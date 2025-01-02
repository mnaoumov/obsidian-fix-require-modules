import type { PluginPass } from '@babel/core';
import type { Visitor } from '@babel/traverse';
import type { CallExpression } from '@babel/types';

import {
  isExpressionStatement,
  isIdentifier,
  isObjectExpression,
  isObjectProperty,
  isProgram,
  isStringLiteral
} from '@babel/types';
import { nameof } from 'obsidian-dev-utils/Object';

import type { RequireOptions } from '../CustomRequire.ts';

import { CacheInvalidationMode } from '../CacheInvalidationMode.ts';
import { BabelPluginBase } from './BabelPluginBase.ts';

interface ExtractRequireArgsListData {
  requireArgsList: RequireArgs[];
  requireFnName: string;
}

interface RequireArgs {
  id: string;
  options: Partial<RequireOptions>;
}
export class ExtractRequireArgsListBabelPlugin extends BabelPluginBase<ExtractRequireArgsListData> {
  public constructor(data: ExtractRequireArgsListData = {
    requireArgsList: [],
    requireFnName: ''
  }) {
    super(data);
  }

  public override getVisitor(): Visitor<PluginPass> {
    return {
      ArrowFunctionExpression: (path): void => {
        if (!isExpressionStatement(path.parent) || !isProgram(path.parentPath.parent)) {
          return;
        }
        const requireFnArgument = path.node.params[0];
        if (!isIdentifier(requireFnArgument)) {
          console.warn('Could not find require function name in arrow function expression');
          return;
        }

        this.data.requireFnName = requireFnArgument.name;
      },
      CallExpression: (path): void => {
        if (!isIdentifier(path.node.callee, { name: this.data.requireFnName })) {
          return;
        }

        const requireArgs = extractRequireArgs(path.node);

        if (!requireArgs) {
          console.warn(`Could not statically analyze require call\n${path.getSource()}`);
          return;
        }

        this.data.requireArgsList.push(requireArgs);
      },
      FunctionDeclaration: (path): void => {
        if (!isProgram(path.parent)) {
          return;
        }
        const requireFnArgument = path.node.params[0];
        if (!isIdentifier(requireFnArgument)) {
          console.warn('Could not find require function name in function declaration');
          return;
        }

        this.data.requireFnName = requireFnArgument.name;
      }
    };
  }
}

function extractRequireArgs(callExpression: CallExpression): null | RequireArgs {
  const idArgument = callExpression.arguments[0];
  const optionsArgument = callExpression.arguments[1];

  if (!isStringLiteral(idArgument)) {
    return null;
  }

  const id = idArgument.value;
  const options: Partial<RequireOptions> = {};

  if (optionsArgument) {
    if (!isObjectExpression(optionsArgument)) {
      return null;
    }

    for (const property of optionsArgument.properties) {
      if (!isObjectProperty(property)) {
        return null;
      }

      if (!isStringLiteral(property.value)) {
        return null;
      }

      const value = property.value.value;

      if (!isStringLiteral(property.key)) {
        return null;
      }

      const key = property.key.value;

      if (key === nameof<RequireOptions>('parentPath')) {
        options.parentPath = value;
      } else if (key === nameof<RequireOptions>('cacheInvalidationMode')) {
        if (!(value in CacheInvalidationMode)) {
          return null;
        }

        options.cacheInvalidationMode = value as CacheInvalidationMode;
      } else {
        return null;
      }
    }
  }

  return { id, options };
}
