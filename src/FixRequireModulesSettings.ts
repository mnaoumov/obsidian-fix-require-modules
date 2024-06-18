
export default class FixRequireModulesSettings {
  public modulesRoot: string = "";
  public invocableScriptsDirectory: string = "";
  public startupScriptPath: string = "";

  public getInvocableScriptsDirectory(): string {
    return this.getPathRelativeToModulesRoot(this.invocableScriptsDirectory);
  }

  public getStartupScriptPath(): string {
    return this.getPathRelativeToModulesRoot(this.startupScriptPath);
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

  public static clone(settings?: FixRequireModulesSettings): FixRequireModulesSettings {
    return Object.assign(new FixRequireModulesSettings(), settings);
  }
}
