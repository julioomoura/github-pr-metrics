// backend/cache.js
// Simple in-memory cache with TTL (Time To Live)

const cache = new Map();
const DEFAULT_TTL = 10 * 60 * 1000; // 10 minutes in milliseconds

/**
 * Sets a value in the cache with a specific key and TTL.
 * @param {string} key - The cache key.
 * @param {any} value - The value to store.
 * @param {number} [ttl=DEFAULT_TTL] - Time To Live in milliseconds.
 */
function set(key, value, ttl = DEFAULT_TTL) {
  const expires = Date.now() + ttl;
  console.log(`[Cache] Setting key: ${key}, TTL: ${ttl / 1000}s`);
  cache.set(key, { value, expires });
}

/**
 * Gets a value from the cache by key. Returns null if expired or not found.
 * @param {string} key - The cache key.
 * @returns {any | null} The cached value or null.
 */
function get(key) {
  const entry = cache.get(key);
  if (!entry) {
    console.log(`[Cache] Miss for key: ${key}`);
    return null;
  }

  if (Date.now() > entry.expires) {
    console.log(`[Cache] Expired key: ${key}`);
    cache.delete(key); // Clean up expired entry
    return null;
  }

  console.log(`[Cache] Hit for key: ${key}`);
  return entry.value;
}

/**
 * Clears the entire cache.
 */
function clear() {
  console.log("[Cache] Clearing cache");
  cache.clear();
}

export default { set, get, clear };
