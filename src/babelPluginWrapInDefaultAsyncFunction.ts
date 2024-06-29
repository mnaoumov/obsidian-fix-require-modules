import type {
  NodePath,
  PluginObj,
  PluginPass
} from "@babel/core";

import {
  assignmentExpression,
  blockStatement,
  expressionStatement,
  functionExpression,
  identifier,
  memberExpression,
  type Program
} from "@babel/types"

const fixSourceMapPlugin: PluginObj<PluginPass> = {
  name: "wrap-in-default-async-function",
  visitor: {
    Program(path: NodePath<Program>) {
      const programBody = path.node.body;
      const wrapperFunction = functionExpression(
        identifier("codeButtonBlockScriptWrapper"),
        [],
        blockStatement(programBody),
        false,
        true
      );

      const moduleExports = expressionStatement(
        assignmentExpression(
          "=",
          memberExpression(identifier("module"), identifier("exports")),
          wrapperFunction
        )
      );

      path.node.body = [moduleExports];
    }
  }
};

export default fixSourceMapPlugin;
