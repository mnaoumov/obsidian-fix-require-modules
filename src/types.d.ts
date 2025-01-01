import type { MaybePromise } from 'obsidian-dev-utils/Async';

import type { RequireOptions } from './CustomRequire.ts';

type RequireAsyncFn = (id: string, options: Partial<RequireOptions>) => Promise<unknown>;
type RequireAsyncWrapperFn<T> = (requireFn: (require: RequireExFn) => MaybePromise<T>) => Promise<T>;
type RequireExFn = NodeRequire & RequireFn;
type RequireFn = (id: string, options: Partial<RequireOptions>) => unknown;

declare global {
  interface Window {
    require?: RequireExFn;
    requireAsync?: RequireAsyncFn;
    requireAsyncWrapper?: RequireAsyncWrapperFn<unknown>;
  }
}
