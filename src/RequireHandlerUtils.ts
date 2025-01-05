import { getPlatformDependencies } from './PlatformDependencies.ts';
import { VAULT_ROOT_PREFIX } from './RequireHandler.ts';

export async function requireStringAsync(source: string, path: string, urlSuffix?: string): Promise<unknown> {
  const platformDependencies = await getPlatformDependencies();
  return await platformDependencies.requireHandler.requireStringAsync(source, path, urlSuffix);
}

export async function requireVaultScriptAsync(id: string): Promise<unknown> {
  const platformDependencies = await getPlatformDependencies();
  return await platformDependencies.requireHandler.requireAsync(VAULT_ROOT_PREFIX + id);
}
