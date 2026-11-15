import type { Database } from '../configs/database';

export function createHealthService(database: Database) {
  return {
    async isReady() {
      try {
        return await database.isReady();
      } catch {
        return false;
      }
    },
  };
}
