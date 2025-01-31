import { noop } from 'obsidian-dev-utils/Function';

export const EMPTY_MODULE_SYMBOL = Symbol('emptyModule');

type ApplyTarget = (this: unknown, ...args: unknown[]) => unknown;
type ConstructTarget = new (...args: unknown[]) => unknown;

export class CachedModuleProxyHandler implements ProxyHandler<object> {
  public constructor(private readonly cachedModuleFn: () => unknown) {
    noop();
  }

  public apply(_target: object, thisArg: unknown, argArray?: unknown[]): unknown {
    const cachedModule = this.cachedModuleFn();
    if (typeof cachedModule === 'function') {
      return Reflect.apply(cachedModule as ApplyTarget, thisArg, argArray ?? []);
    }
    return undefined;
  }

  public construct(_target: object, argArray: unknown[], newTarget: unknown): object {
    const cachedModule = this.cachedModuleFn();
    if (typeof cachedModule === 'function') {
      return Reflect.construct(cachedModule as ConstructTarget, argArray, newTarget as ConstructTarget) as object;
    }
    return {};
  }

  public defineProperty(_target: object, property: string | symbol, attributes: PropertyDescriptor): boolean {
    const cachedModule = this.cachedModuleFn();
    if (cachedModule && typeof cachedModule === 'object') {
      return Reflect.defineProperty(cachedModule, property, attributes);
    }
    return false;
  }

  public deleteProperty(_target: object, property: string | symbol): boolean {
    const cachedModule = this.cachedModuleFn();
    if (cachedModule && typeof cachedModule === 'object') {
      return Reflect.deleteProperty(cachedModule, property);
    }
    return false;
  }

  public get(_target: object, property: string | symbol, receiver: unknown): unknown {
    if (property === EMPTY_MODULE_SYMBOL) {
      return true;
    }

    const cachedModule = this.cachedModuleFn();
    if (cachedModule && typeof cachedModule === 'object') {
      return Reflect.get(cachedModule, property, receiver);
    }
    return undefined;
  }

  public getOwnPropertyDescriptor(_target: object, property: string | symbol): PropertyDescriptor | undefined {
    const cachedModule = this.cachedModuleFn();
    if (cachedModule && typeof cachedModule === 'object') {
      return Reflect.getOwnPropertyDescriptor(cachedModule, property);
    }
    return undefined;
  }

  public getPrototypeOf(): null | object {
    const cachedModule = this.cachedModuleFn();
    if (cachedModule && typeof cachedModule === 'object') {
      return Reflect.getPrototypeOf(cachedModule);
    }
    return null;
  }

  public has(_target: object, property: string | symbol): boolean {
    const cachedModule = this.cachedModuleFn();
    if (cachedModule && typeof cachedModule === 'object') {
      return Reflect.has(cachedModule, property);
    }
    return false;
  }

  public isExtensible(): boolean {
    const cachedModule = this.cachedModuleFn();
    if (cachedModule && typeof cachedModule === 'object') {
      return Reflect.isExtensible(cachedModule);
    }
    return false;
  }

  public ownKeys(): ArrayLike<string | symbol> {
    const cachedModule = this.cachedModuleFn();
    if (cachedModule && typeof cachedModule === 'object') {
      return Reflect.ownKeys(cachedModule);
    }
    return [];
  }

  public preventExtensions(): boolean {
    const cachedModule = this.cachedModuleFn();
    if (cachedModule && typeof cachedModule === 'object') {
      return Reflect.preventExtensions(cachedModule);
    }
    return false;
  }

  public set(_target: object, property: string | symbol, value: unknown, receiver: unknown): boolean {
    const cachedModule = this.cachedModuleFn();
    if (cachedModule && typeof cachedModule === 'object') {
      return Reflect.set(cachedModule, property, value, receiver);
    }
    return false;
  }

  public setPrototypeOf(_target: object, prototype: null | object): boolean {
    const cachedModule = this.cachedModuleFn();
    if (cachedModule && typeof cachedModule === 'object') {
      return Reflect.setPrototypeOf(cachedModule, prototype);
    }
    return false;
  }
}
