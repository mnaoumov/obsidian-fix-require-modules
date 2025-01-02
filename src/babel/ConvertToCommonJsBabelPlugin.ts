import type {
  BabelFile,
  PluginObj,
  PluginPass
} from '@babel/core';
import type { Visitor } from '@babel/traverse';

import { availablePlugins } from '@babel/standalone';

import { BabelPluginBase } from './BabelPluginBase.ts';

interface TransformCodeToCommonJsData {
  hasTopLevelAwait: boolean;
}

export class ConvertToCommonJsBabelPlugin extends BabelPluginBase<TransformCodeToCommonJsData> {
  public constructor(data: TransformCodeToCommonJsData = { hasTopLevelAwait: false }) {
    super(data);
  }

  public override getVisitor(): Visitor<PluginPass> {
    return (availablePlugins['transform-modules-commonjs'] as PluginObj).visitor;
  }

  public override post(_state: PluginPass, file: BabelFile): void {
    this.data.hasTopLevelAwait = file.ast.program.extra?.['topLevelAwait'] as boolean | undefined ?? false;
  }
}
