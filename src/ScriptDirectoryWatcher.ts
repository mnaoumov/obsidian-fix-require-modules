import type { MaybePromise } from 'obsidian-dev-utils/Async';

import type { FixRequireModulesPlugin } from './FixRequireModulesPlugin.ts';

export abstract class ScriptDirectoryWatcher {
  protected plugin!: FixRequireModulesPlugin;
  private wasRegisteredInPlugin = false;

  public async register(plugin: FixRequireModulesPlugin, onChange: () => Promise<void>): Promise<void> {
    if (!this.wasRegisteredInPlugin) {
      this.plugin = plugin;
      this.plugin.register(this.stopWatcher.bind(this));
      this.wasRegisteredInPlugin = true;
    }

    this.stopWatcher();
    await this.startWatcher(onChange);
  }

  protected abstract startWatcher(onChange: () => Promise<void>): MaybePromise<void>;
  protected abstract stopWatcher(): void;
}
