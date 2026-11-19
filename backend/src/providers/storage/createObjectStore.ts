import type { AppConfig } from '../../configs/env';
import { LocalStorage, type ObjectStore } from './local.storage';
import { NeonStorage } from './neon.storage';
export const createObjectStore = (c: AppConfig): ObjectStore =>
  c.remoteStorage
    ? new NeonStorage(c.storageRoot, c.remoteStorage)
    : new LocalStorage(c.storageRoot);
