import type { MaybePromise } from 'obsidian-dev-utils/Async';

import type { CodeScriptToolkitPlugin } from './CodeScriptToolkitPlugin.ts';

export abstract class ScriptDirectoryWatcher {
  protected plugin!: CodeScriptToolkitPlugin;
  private wasRegisteredInPlugin = false;

  public async register(plugin: CodeScriptToolkitPlugin, onChange: () => Promise<void>): Promise<void> {
    if (!this.wasRegisteredInPlugin) {
      this.plugin = plugin;
      this.plugin.register(this.stopWatcher.bind(this));
      this.wasRegisteredInPlugin = true;
    }

    this.stopWatcher();
    if (await this.startWatcher(onChange)) {
      await onChange();
    }

    this.plugin.register(this.stopWatcher.bind(this));
  }

  protected abstract startWatcher(onChange: () => Promise<void>): MaybePromise<boolean>;
  protected abstract stopWatcher(): void;
}
