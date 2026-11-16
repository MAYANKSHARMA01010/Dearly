import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const key = 'dearly.session.v1';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
// Web intentionally uses memory only: never put bearer tokens in localStorage.
let webValue = /** @type {string | null} */ (null);
export const secureSessionStorage = {
  read: () => Platform.OS === 'web' ? Promise.resolve(webValue) : SecureStore.getItemAsync(key, options),
  /** @param {string} value */
  write: async (value) => { if (Platform.OS === 'web') webValue = value; else await SecureStore.setItemAsync(key, value, options); },
  clear: async () => { if (Platform.OS === 'web') webValue = null; else await SecureStore.deleteItemAsync(key, options); },
};
