import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredRithmicCredentials,
  loadStoredRithmicCredentials,
  saveRithmicCredentials
} from '../../src/services/rithmicCredentialStorage';

interface StoredValue {
  id: string;
  key: CryptoKey;
  iv: number[];
  ciphertext: number[];
}

class FakeRequest<T> {
  result!: T;
  error: DOMException | null = null;
  onsuccess: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onupgradeneeded: ((event: Event) => void) | null = null;
}

class FakeTransaction {
  error: DOMException | null = null;
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;

  complete() {
    queueMicrotask(() => this.oncomplete?.());
  }
}

class FakeObjectStore {
  constructor(private readonly records: Map<string, StoredValue>, private readonly transaction: FakeTransaction) {}

  get(id: string) {
    const request = new FakeRequest<StoredValue | undefined>();
    queueMicrotask(() => {
      request.result = this.records.get(id);
      request.onsuccess?.(new Event('success'));
    });
    return request;
  }

  put(value: StoredValue) {
    this.records.set(value.id, value);
    this.transaction.complete();
  }

  delete(id: string) {
    this.records.delete(id);
    this.transaction.complete();
  }
}

class FakeDatabase {
  readonly objectStoreNames = {
    contains: (name: string) => this.records.has(name)
  };
  private readonly records = new Map<string, StoredValue>();

  createObjectStore(name: string) {
    this.records.set(name, undefined as unknown as StoredValue);
    return new FakeObjectStore(this.records, new FakeTransaction());
  }

  transaction() {
    const transaction = new FakeTransaction();
    return {
      ...transaction,
      objectStore: () => new FakeObjectStore(this.records, transaction),
      get oncomplete() { return transaction.oncomplete; },
      set oncomplete(handler: (() => void) | null) { transaction.oncomplete = handler; },
      get onerror() { return transaction.onerror; },
      set onerror(handler: (() => void) | null) { transaction.onerror = handler; },
      get error() { return transaction.error; }
    };
  }

  close() {}
}

function createFakeIndexedDb() {
  const database = new FakeDatabase();
  let upgraded = false;
  return {
    open: () => {
      const request = new FakeRequest<FakeDatabase>();
      queueMicrotask(() => {
        request.result = database;
        if (!upgraded) {
          upgraded = true;
          request.onupgradeneeded?.(new Event('upgradeneeded'));
        }
        request.onsuccess?.(new Event('success'));
      });
      return request;
    }
  } as unknown as IDBFactory;
}

describe('secure Rithmic credential storage', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('indexedDB', createFakeIndexedDb());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('encrypts, persists, and restores credentials without localStorage', async () => {
    const credentials = { username: 'test-user', password: 'test-password' };
    expect(await saveRithmicCredentials(credentials)).toBe(true);
    expect(await loadStoredRithmicCredentials()).toEqual(credentials);
    expect(globalThis.localStorage?.length ?? 0).toBe(0);
  });

  it('clears stored credentials', async () => {
    await saveRithmicCredentials({ username: 'test-user', password: 'test-password' });
    expect(await clearStoredRithmicCredentials()).toBe(true);
    expect(await loadStoredRithmicCredentials()).toBeNull();
  });

  it('fails closed when secure browser storage is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    expect(await saveRithmicCredentials({ username: 'user', password: 'pass' })).toBe(false);
    expect(await loadStoredRithmicCredentials()).toBeNull();
    expect(await clearStoredRithmicCredentials()).toBe(false);
  });
});
