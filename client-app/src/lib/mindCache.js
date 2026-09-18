/**
 * mindCache.js -- IndexedDB cache for compiled mind-ar buffers.
 *
 * Compiling image targets (mind-ar's Compiler.compileImageTargets) is the
 * single biggest source of latency on Magic Camera -- it runs full SIFT-like
 * feature extraction in the browser, which takes 5-30s on a real Android
 * phone even for a single target. The output buffer is deterministic: the
 * same set of images always produces the same buffer. Caching it in
 * IndexedDB means the second visit (and every subsequent one while the
 * targets don't change) skips compilation entirely and loads in < 500 ms.
 *
 * Cache invalidation: keyed by a fingerprint that combines each target's
 * imageUrl. If the admin changes any image URL (re-uploading replaces the
 * file, which changes the URL), the fingerprint changes and the old entry is
 * never matched -- no explicit eviction needed. A MAX_ENTRIES cap prevents
 * the store from growing forever if many different target sets are visited.
 */

const DB_NAME = 'huntsTAG-mind-cache';
const STORE_NAME = 'buffers';
const DB_VERSION = 1;
const MAX_ENTRIES = 10; // evict oldest if we exceed this

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('savedAt', 'savedAt', { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Builds a stable string key from an ordered list of image URLs.
 * Simple concat with a separator that cannot appear in a URL.
 */
export function buildCacheKey(imageUrls) {
  return imageUrls.join('\x00');
}

/**
 * Returns the cached ArrayBuffer for this key, or null if not found.
 */
export async function getCachedBuffer(key) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result?.buffer ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    // Any IDB error (private browsing, quota, corruption) -- treat as cache miss
    console.warn('[mindCache] read error, treating as miss:', err);
    return null;
  }
}

/**
 * Stores an ArrayBuffer under the given key.
 * Evicts oldest entries if MAX_ENTRIES exceeded.
 */
export async function setCachedBuffer(key, buffer) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ key, buffer, savedAt: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    // Evict oldest entries beyond MAX_ENTRIES
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const index = tx.objectStore(STORE_NAME).index('savedAt');
      const req = index.openCursor(null, 'next'); // oldest first
      let count = 0;
      const keys = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          keys.push(cursor.primaryKey);
          count++;
          cursor.continue();
        } else {
          if (count > MAX_ENTRIES) {
            const toDelete = keys.slice(0, count - MAX_ENTRIES);
            toDelete.forEach((k) => tx.objectStore(STORE_NAME).delete(k));
          }
          resolve();
        }
      };
      req.onerror = resolve; // non-fatal
    });
  } catch (err) {
    console.warn('[mindCache] write error (non-fatal):', err);
  }
}
