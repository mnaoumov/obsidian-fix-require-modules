import type { MaybePromise } from 'obsidian-dev-utils/Async';

import type { RequireOptions } from './RequireHandler.ts';

type RequireAsyncFn = (id: string, options?: Partial<RequireOptions>) => Promise<unknown>;
type RequireAsyncWrapperArg<T> = (require: RequireExFn) => MaybePromise<T>;
type RequireAsyncWrapperFn<T> = (requireFn: RequireAsyncWrapperArg<T>) => Promise<T>;
type RequireExFn = NodeRequire & RequireFn & { parentPath?: string };
type RequireFn = (id: string, options: Partial<RequireOptions>) => unknown;

declare global {
  interface Window {
    require?: RequireExFn;
    requireAsync?: RequireAsyncFn;
    requireAsyncWrapper?: RequireAsyncWrapperFn<unknown>;
  }
}
