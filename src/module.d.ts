import "node:module";

declare global {
  namespace NodeJS {
    export interface Module {
      _compile(code: string, filename: string): void;
      load(filename: string): void;
    }
  }
}

declare module "node:module" {
  export function _resolveFilename(request: string, parent: Module, isMain: boolean, options?: { paths?: string[] }): string;
}
