import "node:module";

declare module "node:module" {
  export function _resolveFilename(request: string, parent: Module, isMain: boolean, options?: { paths?: string[] }): string;
}
