import { randomUUID } from 'crypto';

const SERVICE_NAME = 'database-cli-dumper';

let keytarModule: typeof import('keytar') | null | undefined;

async function loadKeytar() {
  if (keytarModule !== undefined) return keytarModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    keytarModule = require('keytar');
  } catch (err) {
    keytarModule = null;
  }
  return keytarModule;
}

export type SecretStorage = 'keytar' | 'plaintext';

export interface SaveSecretResult {
  ref: string;
  storage: SecretStorage;
  warning?: string;
}

export async function savePassword(password: string, existingRef?: string): Promise<SaveSecretResult> {
  const keytar = await loadKeytar();
  const account = existingRef && existingRef.startsWith('keytar:') ? existingRef.split(':')[1] : randomUUID();
  if (keytar) {
    await keytar.setPassword(SERVICE_NAME, account, password);
    return { ref: `keytar:${account}`, storage: 'keytar' };
  }
  return {
    ref: `plaintext:${password}`,
    storage: 'plaintext',
    warning: 'keytar unavailable; storing password in plaintext in config',
  };
}

export async function resolvePassword(ref: string): Promise<string | undefined> {
  if (!ref) return undefined;
  if (ref.startsWith('plaintext:')) return ref.slice('plaintext:'.length);
  if (ref.startsWith('keytar:')) {
    const keytar = await loadKeytar();
    if (!keytar) return undefined;
    const account = ref.slice('keytar:'.length);
    return keytar.getPassword(SERVICE_NAME, account) || undefined;
  }
  return undefined;
}

export async function deletePassword(ref: string): Promise<void> {
  if (ref.startsWith('keytar:')) {
    const keytar = await loadKeytar();
    if (keytar) {
      const account = ref.slice('keytar:'.length);
      await keytar.deletePassword(SERVICE_NAME, account);
    }
  }
}

export function isPlaintextRef(ref: string): boolean {
  return ref.startsWith('plaintext:');
}
