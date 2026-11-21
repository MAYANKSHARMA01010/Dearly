import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { initializeMediaCache, clearMediaCache } from '../services/attachments/device';
import { AppState } from 'react-native';
import { apiClient } from '../api/client';
import { getApiBaseUrl } from '../config/api';
import { createSessionManager } from '../services/auth/sessionManager';
import { privateCache } from '../services/cache/device';
import { secureSessionStorage } from '../services/auth/secureSessionStorage';

const manager = createSessionManager({ client: apiClient, storage: secureSessionStorage, getScope: getApiBaseUrl, cache: privateCache });
const AuthContext = createContext(manager);
/** @param {{children: import('react').ReactNode}} props */
export function AuthProvider({ children }) {
  useEffect(() => {
    void initializeMediaCache().catch(() => {}).then(() => manager.restore());
    const unsubscribe = manager.subscribe(() => { if (manager.getSnapshot().status === 'anonymous') void clearMediaCache().catch(() => {}); });
    let backgrounded = false;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') backgrounded = true;
      if (next === 'active' && backgrounded) {
        backgrounded = false;
        if (manager.getSnapshot().status === 'authenticated') void manager.restore();
      }
    });
    return () => { subscription.remove(); unsubscribe(); };
  }, []);
  return <AuthContext.Provider value={manager}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const session = useContext(AuthContext);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return { ...state, session };
}
