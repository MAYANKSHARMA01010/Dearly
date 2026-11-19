import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { createNotificationService } from './service';
export const nativePushAvailable =
  Platform.OS !== 'web' && Constants.executionEnvironment !== 'storeClient';
export const pushProjectId =
  Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
const key = 'dearly.push.installation.v1';
async function installation() {
  let id = await SecureStore.getItemAsync(key);
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync(key, id);
  }
  return id;
}
/** @param {Parameters<typeof createNotificationService>[0]} session @param {boolean} [requestPermission] */
export async function registerPush(session, requestPermission = false) {
  if (!nativePushAvailable)
    return 'Push needs a development build. Your in-app notifications still work.';
  if (typeof pushProjectId !== 'string')
    return 'Push setup is pending. Your in-app notifications still work.';
  const n = await import('expo-notifications');
  if (Platform.OS === 'android')
    await n.setNotificationChannelAsync('dearly-updates', {
      name: 'Dearly updates',
      importance: n.AndroidImportance.DEFAULT,
    });
  let permission = await n.getPermissionsAsync();
  if (!permission.granted && requestPermission)
    permission = await n.requestPermissionsAsync();
  const api = createNotificationService(session),
    id = await installation();
  if (!permission.granted) {
    await api.remove(id);
    return 'Notifications are not allowed. You can change this in phone Settings.';
  }
  const token = await n.getExpoPushTokenAsync({ projectId: pushProjectId });
  await api.register({
    id,
    token: token.data,
    platform: Platform.OS,
    projectId: pushProjectId,
  });
  return 'This device is registered for push updates.';
}
