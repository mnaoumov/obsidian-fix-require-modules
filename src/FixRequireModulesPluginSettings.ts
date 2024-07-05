export default class FixRequireModulesPluginSettings {
  public modulesRoot: string = "";
  public invocableScriptsDirectory: string = "";
  public startupScriptPath: string = "";

  public getInvocableScriptsDirectory(): string {
    return this.getPathRelativeToModulesRoot(this.invocableScriptsDirectory);
  }

  public getStartupScriptPath(): string {
    return this.getPathRelativeToModulesRoot(this.startupScriptPath);
  }

  public static load(value: unknown): FixRequireModulesPluginSettings {
    if (!value) {
      return new FixRequireModulesPluginSettings();
    }

    return value as FixRequireModulesPluginSettings;
  }

  public static clone(settings?: FixRequireModulesPluginSettings): FixRequireModulesPluginSettings {
    return Object.assign(new FixRequireModulesPluginSettings(), settings);
  }

  private getPathRelativeToModulesRoot(path: string): string {
    if (!path) {
      return "";
    }

    if (!this.modulesRoot) {
      return path;
    }

    return this.modulesRoot + "/" + path;
  }
}
