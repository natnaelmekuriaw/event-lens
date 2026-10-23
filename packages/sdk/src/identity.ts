export interface IdentityContext {
  anonymousId: string;
  userId?: string;
}
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export function anonymousId(): string {
  return globalThis.crypto.randomUUID();
}
export function defaultStorage(): StorageAdapter | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}
export function readStorage(
  storage: StorageAdapter | undefined,
  key: string,
): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
export function writeStorage(
  storage: StorageAdapter | undefined,
  key: string,
  value: string | null,
) {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    /* Storage denial falls back to memory. */
  }
}
