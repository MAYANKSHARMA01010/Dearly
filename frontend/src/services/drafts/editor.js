import { ApiError } from '../../api/client.js';
import { prepareContent } from './contracts.js';

/** @typedef {import('./contracts.js').DraftContent} Content */
/** @typedef {import('./contracts.js').Draft} Draft */
/** @typedef {{ id: string|null, version: number|null, content: Content, dirty: boolean, loading: boolean, saving: boolean, deleting: boolean, deleted: boolean, loaded: boolean, error: string, conflict: boolean, uncertain: boolean, savedAt: string|null }} EditorState */
const blank = () => /** @type {Content} */ ({ subject: null, text: '', occasion: null, recipients: [] });
/** @param {Content} value */
const clone = (value) => ({ subject: value.subject, text: value.text, occasion: value.occasion, recipients: value.recipients.map((r) => ({ ...r })) });
/** @param {unknown} error */
const message = (error) => error instanceof ApiError ? error.message : 'This action could not finish. Please try again.';
/** @param {unknown} error */
const uncertain = (error) => !(error instanceof ApiError) || ['network', 'timeout', 'aborted', 'invalid_response'].includes(error.kind) || (error.status !== null && error.status >= 500);

/** @param {{ api: ReturnType<typeof import('./service.js').createDraftService>, ownerId: string, id?: string|null }} input */
export function createDraftEditor({ api, ownerId, id = null }) {
  let state = /** @type {EditorState} */ ({ id, version: null, content: blank(), dirty: false, loading: false, saving: false, deleting: false, deleted: false, loaded: id === null, error: '', conflict: false, uncertain: false, savedAt: null });
  let baseline = blank(); let disposed = false;
  let pending = /** @type {Promise<boolean>|null} */ (null);
  let operation = '';
  const listeners = new Set();
  /** @param {Partial<EditorState>} patch */
  const publish = (patch) => { if (disposed) return; state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  /** @param {Draft} draft */
  const accept = (draft) => { if (disposed) return; baseline = clone(draft); publish({ id: draft.id, version: draft.version, content: clone(draft), dirty: false, loaded: true, savedAt: draft.updatedAt, conflict: false, uncertain: false, error: '' }); };
  /** @param {() => Promise<void>} work @param {'loading'|'saving'|'deleting'} kind */
  const single = (work, kind) => {
    if (disposed) return Promise.resolve(false);
    if (pending) return operation === kind ? pending : Promise.resolve(false);
    operation = kind;
    publish({ [kind]: true, error: '' });
    pending = (async () => {
      try { await work(); return !disposed; }
      catch (error) {
        const missing = error instanceof ApiError && error.status === 404;
        if (missing) baseline = blank();
        publish({ error: message(error), conflict: error instanceof ApiError && error.code === 'VERSION_CONFLICT', uncertain: kind !== 'loading' && uncertain(error),
          ...(missing && { deleted: true, dirty: false, content: blank() }) });
        return false;
      }
      finally { publish({ [kind]: false }); pending = null; operation = ''; }
    })();
    return pending;
  };
  return {
    getSnapshot: () => state,
    /** @param {() => void} listener */
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** @param {Partial<Content>} patch */
    edit(patch) {
      if (pending || disposed || !state.loaded) return;
      const content = clone({ ...state.content, ...patch });
      publish({ content, dirty: JSON.stringify(content) !== JSON.stringify(baseline), error: '' });
    },
    open() { if (!state.id || (state.loaded && (state.dirty || state.uncertain || state.conflict))) return Promise.resolve(true); return this.reload(); },
    reload() {
      return single(async () => { if (state.id) accept(await api.read(state.id)); }, 'loading');
    },
    save() {
      if (state.uncertain || state.conflict || state.deleted || !state.loaded) return Promise.resolve(false);
      return single(async () => {
        const content = prepareContent(state.content, ownerId);
        const draft = state.id && state.version ? await api.update(state.id, state.version, content) : await api.create(content);
        accept(draft);
      }, 'saving');
    },
    remove() {
      if (!state.id || !state.version || state.deleted || state.uncertain || state.conflict) return Promise.resolve(false);
      return single(async () => {
        await api.remove(/** @type {string} */ (state.id), /** @type {number} */ (state.version));
        baseline = blank(); publish({ deleted: true, dirty: false, content: blank() });
      }, 'deleting');
    },
    discard() {
      if (pending) return;
      publish({ content: clone(baseline), dirty: false, error: '', conflict: false, uncertain: false });
    },
    dispose() { disposed = true; baseline = blank(); state = { ...state, content: blank() }; listeners.clear(); },
  };
}

/** @param {ReturnType<typeof import('./service.js').createDraftService>} api */
export function createDraftWorkspace(api) {
  let account = /** @type {string|null} */ (null);
  const editors = new Map();
  return {
    /** @param {string|null} key */
    bind(key) { if (key === account) return; for (const model of editors.values()) model.dispose(); editors.clear(); account = key; },
    /** @param {string} ownerId @param {string|null} id @returns {ReturnType<typeof createDraftEditor>} */
    editor(ownerId, id) {
      const key = id ?? 'new';
      if (!editors.has(key)) editors.set(key, createDraftEditor({ api, ownerId, id }));
      return editors.get(key);
    },
    /** @param {string} id @param {ReturnType<typeof createDraftEditor>} model */
    adopt(id, model) { if (editors.get('new') === model) editors.delete('new'); editors.set(id, model); },
  };
}
