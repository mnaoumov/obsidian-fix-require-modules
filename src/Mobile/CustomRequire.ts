import { CustomRequire } from '../CustomRequire.ts';

class CustomRequireImpl extends CustomRequire {
  protected override canReadFileSync(): boolean {
    return false;
  }
}

export const customRequire = new CustomRequireImpl();
