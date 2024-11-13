export default class FixRequireModulesPluginSettings {
  public invocableScriptsDirectory = '';
  public modulesRoot = '';
  public startupScriptPath = '';

  private getPathRelativeToModulesRoot(path: string): string {
    if (!path) {
      return '';
    }

    if (!this.modulesRoot) {
      return path;
    }

    return this.modulesRoot + '/' + path;
  }

  public getInvocableScriptsDirectory(): string {
    return this.getPathRelativeToModulesRoot(this.invocableScriptsDirectory);
  }

  public getStartupScriptPath(): string {
    return this.getPathRelativeToModulesRoot(this.startupScriptPath);
  }
}
