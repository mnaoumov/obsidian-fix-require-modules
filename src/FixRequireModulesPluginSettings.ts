export default class FixRequireModulesPluginSettings {
  public modulesRoot = '';
  public invocableScriptsDirectory = '';
  public startupScriptPath = '';

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

    return this.modulesRoot + '/' + path;
  }
}
