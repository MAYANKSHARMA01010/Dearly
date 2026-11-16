import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { getApiBaseUrl } from '../config/api';
import { createDraftService } from '../services/drafts/service';
import { createDraftWorkspace } from '../services/drafts/editor';

/** @typedef {{ api: ReturnType<typeof createDraftService>, workspace: ReturnType<typeof createDraftWorkspace> }} Workspace */
const Context = createContext(/** @type {Workspace|null} */ (null));
/** @param {{ children: import('react').ReactNode }} props */
export function DraftWorkspaceProvider({ children }) {
  const { session } = useAuth();
  const [value] = useState(() => {
    const api = createDraftService({ request: (path, options) => session.request(path, options) });
    return { api, workspace: createDraftWorkspace(api) };
  });
  useEffect(() => {
    const sync = () => {
      const state = session.getSnapshot();
      if (state.status === 'anonymous') value.workspace.bind(null);
      if (state.status === 'authenticated' && state.user) value.workspace.bind(`${getApiBaseUrl()}|${state.user.id}`);
    };
    sync(); return session.subscribe(sync);
  }, [session, value]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useDraftWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error('Draft workspace is unavailable.');
  const { user } = useAuth();
  // Bind synchronously as well: a newly signed-in account must never read an old
  // editor while React is waiting to run provider effects.
  if (user) value.workspace.bind(`${getApiBaseUrl()}|${user.id}`);
  return value;
}
