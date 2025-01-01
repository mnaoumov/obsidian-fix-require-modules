import type { MaybePromise } from 'obsidian-dev-utils/Async';

import type { CustomRequireOptions } from './CustomRequire.ts';

type CustomRequireFn = (id: string, options: Partial<CustomRequireOptions>) => unknown;
type DynamicImportFn = (id: string, options: Partial<CustomRequireOptions>) => Promise<unknown>;
type RequireExFn = CustomRequireFn & NodeRequire;
type RequireWrapperFn<T> = (requireFn: (require: RequireExFn) => MaybePromise<T>) => Promise<T>;

declare global {
  interface Window {
    dynamicImport?: DynamicImportFn;
    require?: RequireExFn;
    requireWrapper?: RequireWrapperFn<unknown>;
  }
}
