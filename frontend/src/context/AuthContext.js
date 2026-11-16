import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { apiClient } from '../api/client';
import { getApiBaseUrl } from '../config/api';
import { createSessionManager } from '../services/auth/sessionManager';
import { secureSessionStorage } from '../services/auth/secureSessionStorage';

const manager = createSessionManager({ client: apiClient, storage: secureSessionStorage, getScope: getApiBaseUrl });
const AuthContext = createContext(manager);
/** @param {{children: import('react').ReactNode}} props */
export function AuthProvider({ children }) {
  useEffect(() => {
    void manager.restore();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && manager.getSnapshot().status === 'authenticated') void manager.restore();
    });
    return () => subscription.remove();
  }, []);
  return <AuthContext.Provider value={manager}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const session = useContext(AuthContext);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return { ...state, session };
}
