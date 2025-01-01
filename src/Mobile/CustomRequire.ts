import { CustomRequire } from '../CustomRequire.ts';

class CustomRequireImpl extends CustomRequire {
  protected override canRequireSync(): boolean {
    return false;
  }

  protected override requireSync(): unknown {
    throw new Error('Cannot require synchronously on mobile');
  }
}

export const customRequire = new CustomRequireImpl();
