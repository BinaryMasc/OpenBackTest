import { DEFAULT_RITHMIC_GATEWAY_ADDRESS, type RithmicCredentials } from './rithmic';

const DATABASE_NAME = 'openbacktest-secure-storage';
const STORE_NAME = 'rithmic-credentials';
const RECORD_ID = 'current';

interface StoredCredentialRecord {
  id: string;
  key: CryptoKey;
  iv: number[];
  ciphertext: number[];
}

function assertSupportedStorage(): void {
  if (typeof indexedDB === 'undefined' || !globalThis.crypto?.subtle) {
    throw new Error('Secure browser credential storage is unavailable');
  }
}

function openDatabase(): Promise<IDBDatabase> {
  assertSupportedStorage();

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open secure credential storage'));
  });
}

function readRecord(database: IDBDatabase): Promise<StoredCredentialRecord | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(RECORD_ID) as IDBRequest<StoredCredentialRecord | undefined>;
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not read secure credential storage'));
  });
}

function writeRecord(database: IDBDatabase, record: StoredCredentialRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not write secure credential storage'));
    transaction.objectStore(STORE_NAME).put(record);
  });
}

function deleteRecord(database: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not clear secure credential storage'));
    transaction.objectStore(STORE_NAME).delete(RECORD_ID);
  });
}

export async function loadStoredRithmicCredentials(): Promise<RithmicCredentials | null> {
  let database: IDBDatabase | undefined;
  try {
    database = await openDatabase();
    const record = await readRecord(database);
    if (!record) return null;

    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(record.iv) },
      record.key,
      new Uint8Array(record.ciphertext)
    );
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as Partial<RithmicCredentials>;
    if (typeof parsed.username !== 'string' || typeof parsed.password !== 'string') return null;
    return {
      username: parsed.username,
      password: parsed.password,
      gatewayUrl: parsed.gatewayUrl || DEFAULT_RITHMIC_GATEWAY_ADDRESS
    };
  } catch {
    return null;
  } finally {
    database?.close();
  }
}

export async function saveRithmicCredentials(credentials: RithmicCredentials): Promise<boolean> {
  let database: IDBDatabase | undefined;
  try {
    database = await openDatabase();
    const previous = await readRecord(database);
    const key = previous?.key ?? await globalThis.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(credentials));
    const ciphertext = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

    await writeRecord(database, {
      id: RECORD_ID,
      key,
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(ciphertext))
    });
    return true;
  } catch {
    return false;
  } finally {
    database?.close();
  }
}

export async function clearStoredRithmicCredentials(): Promise<boolean> {
  let database: IDBDatabase | undefined;
  try {
    database = await openDatabase();
    await deleteRecord(database);
    return true;
  } catch {
    return false;
  } finally {
    database?.close();
  }
}
