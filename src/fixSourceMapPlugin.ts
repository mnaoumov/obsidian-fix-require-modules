import {
  NodePath,
  type PluginObj,
  type PluginPass,
  types
} from "@babel/core";

interface FixSourceMapPluginState extends PluginPass {
  opts: { code: string }
}

type InputMap = {
  sourcemap: {
    sources: string[];
  }
};

const fixSourceMapPlugin: PluginObj<FixSourceMapPluginState> = {
  name: "fix-source-map",
  visitor: {
    Program(_: NodePath<types.Program>, state: FixSourceMapPluginState): void {
      debugger;
      const inputMap = state.file.inputMap as InputMap;
      const base64 = Buffer.from(state.opts.code).toString("base64");
      inputMap.sourcemap.sources[0] = `data:application/typescript;base64,${base64}`;
    }
  }
};

export default fixSourceMapPlugin;
