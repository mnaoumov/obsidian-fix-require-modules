import type Module from "node:module";

declare global {
  namespace NodeJS {
    export interface Module {
      _compile(code: string, filename: string): unknown;
      load(filename: string): void;
    }
  }
}

declare module "node:module" {
  export function _resolveFilename(request: string, parent: Module, isMain: boolean, options?: { paths?: string[] }): string;
}
