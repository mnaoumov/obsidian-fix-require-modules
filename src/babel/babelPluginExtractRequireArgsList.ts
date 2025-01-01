import type {
  PluginObj,
  PluginPass
} from '@babel/core';
import type { CallExpression } from '@babel/types';

import { transform } from '@babel/standalone';
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

interface PluginState extends PluginPass {
  opts: {
    requireArgsList: RequireArgs[];
  };
  requireFnName: string;
}

interface RequireArgs {
  id: string;
  options: Partial<RequireOptions>;
}

const babelPluginExtractRequires: PluginObj<PluginState> = {
  name: 'extract-requires',
  visitor: {
    ArrowFunctionExpression(path, state) {
      if (!isExpressionStatement(path.parent) || !isProgram(path.parentPath.parent)) {
        return;
      }
      const requireFnArgument = path.node.params[0];
      if (!isIdentifier(requireFnArgument)) {
        console.warn('Could not find require function name in arrow function expression');
        return;
      }

      state.requireFnName = requireFnArgument.name;
    },
    CallExpression(path, state) {
      if (!isIdentifier(path.node.callee, { name: state.requireFnName })) {
        return;
      }

      const requireArgs = extractRequireArgs(path.node);

      if (!requireArgs) {
        console.warn(`Could not statically analyze require call\n${path.getSource()}`);
        return;
      }

      state.opts.requireArgsList.push(requireArgs);
    },
    FunctionDeclaration(path, state) {
      if (!isProgram(path.parent)) {
        return;
      }
      const requireFnArgument = path.node.params[0];
      if (!isIdentifier(requireFnArgument)) {
        console.warn('Could not find require function name in function declaration');
        return;
      }

      state.requireFnName = requireFnArgument.name;
    }
  }
};

export function extractRequireArgsList(code: string): RequireArgs[] {
  const opts: PluginState['opts'] = {
    requireArgsList: []
  };

  transform(code, {
    filename: 'requireAsyncWrapper.js',
    plugins: [
      [babelPluginExtractRequires, opts]
    ],
    presets: ['typescript']
  });

  return opts.requireArgsList;
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
