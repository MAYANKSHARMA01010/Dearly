// Web never writes private content to IndexedDB/localStorage or a plaintext DB.
export const privateCache = {
  suspend() {},
  async activate(/** @type {string} */ account, /** @type {string} */ origin) {},
  async capture(/** @type {string} */ path, /** @type {unknown} */ value) {},
  async read(/** @type {import('./policy.js').CacheKind} */ kind, /** @type {string} */ key) { return null; },
  async invalidate() {},
  async purge() {},
};
