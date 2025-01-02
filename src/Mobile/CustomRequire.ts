import { CapacitorAdapter } from 'obsidian';

import { CustomRequire } from '../CustomRequire.ts';

class CustomRequireImpl extends CustomRequire {
  private get capacitorAdapter(): CapacitorAdapter {
    const adapter = this.plugin.app.vault.adapter;
    if (!(adapter instanceof CapacitorAdapter)) {
      throw new Error('Vault adapter is not a CapacitorAdapter');
    }

    return adapter;
  }

  protected override canRequireNonCached(): boolean {
    return false;
  }

  protected override async existsAsync(path: string): Promise<boolean> {
    return await this.capacitorAdapter.fs.exists(path);
  }

  protected override async getTimestampAsync(path: string): Promise<number> {
    return (await this.capacitorAdapter.fs.stat(path)).mtime ?? 0;
  }

  protected override async readFileAsync(path: string): Promise<string> {
    return await this.capacitorAdapter.fs.read(path);
  }

  protected override requireNonCached(): unknown {
    throw new Error('Cannot require synchronously on mobile');
  }
}

export const customRequire = new CustomRequireImpl();
