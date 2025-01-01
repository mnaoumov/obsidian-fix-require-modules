import { PluginSettingsBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsBase';
import { join } from 'obsidian-dev-utils/Path';

export class FixRequireModulesPluginSettings extends PluginSettingsBase {
  public invocableScriptsDirectory = '';
  public mobileChangesCheckingIntervalInSeconds = 30;
  public modulesRoot = '';
  public startupScriptPath = '';

  public constructor(data: unknown) {
    super();
    this.init(data);
  }

  public getInvocableScriptsDirectory(): string {
    return this.getPathRelativeToModulesRoot(this.invocableScriptsDirectory);
  }

  public getStartupScriptPath(): string {
    return this.getPathRelativeToModulesRoot(this.startupScriptPath);
  }

  private getPathRelativeToModulesRoot(path: string): string {
    if (!path) {
      return '';
    }

    if (!this.modulesRoot) {
      return path;
    }

    return join(this.modulesRoot, path);
  }
}
