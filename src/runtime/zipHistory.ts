export interface ZipMeta {
  id: string;
  name: string;
  size: number;
  lastModified: number;
  createdAt: number;
}

const DB_NAME = 'aistudioformove-zip-db';
const DB_VERSION = 1;
const STORE_NAME = 'zipFiles';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveZipToHistory(file: File | Blob & { name?: string; lastModified?: number }): Promise<ZipMeta> {
  const name = (file as File).name || '未命名.zip';
  const lastModified = (file as File).lastModified || Date.now();
  const size = file.size;
  const id = `${name}-${size}-${lastModified}`;

  const meta: ZipMeta = {
    id,
    name,
    size,
    lastModified,
    createdAt: Date.now(),
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ ...meta, blob: file });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return meta;
}

export async function listZipHistory(): Promise<ZipMeta[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const records = request.result as any[];
      const metas: ZipMeta[] = records.map((r) => ({
        id: r.id,
        name: r.name,
        size: r.size,
        lastModified: r.lastModified,
        createdAt: r.createdAt,
      }));
      metas.sort((a, b) => b.createdAt - a.createdAt);
      resolve(metas);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function loadZipBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const record = request.result as any;
      if (!record) return resolve(null);
      resolve(record.blob as Blob);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteZipFromHistory(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
