import { useEffect, useState, useSyncExternalStore } from 'react';
import { Keyboard } from 'react-native';
import { Stack, usePreventRemove, useRouter } from 'expo-router';
import { Dialog, Portal, Text, useTheme } from 'react-native-paper';
import Screen from '../../components/layout/Screen';
import StateView from '../../components/common/StateView';
import AppButton from '../../components/common/AppButton';
import AppTextField from '../../components/forms/AppTextField';
import RecipientEditor from '../../components/recipients/RecipientEditor';
import AttachmentPanel from '../../components/media/AttachmentPanel';
import OccasionPicker from '../../components/messages/OccasionPicker';
import { useAuth } from '../../context/AuthContext';
import { useDraftWorkspace } from '../../context/DraftWorkspaceContext';

/** @param {{ draftId: string|null }} props */
export default function DraftEditorScreen({ draftId }) {
  const { user } = useAuth(); const { workspace } = useDraftWorkspace(); const router = useRouter(); const theme = useTheme();
  const [model] = useState(() => workspace.editor(user?.id ?? '', draftId));
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  const [repeat, setRepeat] = useState(/** @type {{ run: () => void }|null} */ (null));
  const [confirm, setConfirm] = useState(/** @type {'reload'|'delete'|null} */ (null));
  const [createdId, setCreatedId] = useState(/** @type {string|null} */ (null));
  const [recipientPending, setRecipientPending] = useState(false);
  const [mediaGuard, setMediaGuard] = useState({ pending:false, busy:false });
  const busy = mediaGuard.busy || state.saving || state.loading || state.deleting;
  const dirty = state.dirty || state.uncertain || recipientPending || mediaGuard.pending;
  usePreventRemove(Boolean(user) && !state.deleted && (dirty || busy), (event) => { setRepeat({ run: event.repeat }); });
  useEffect(() => { void model.open(); }, [model]);
  useEffect(() => { if (createdId && !dirty && !busy) router.replace({ pathname: '/drafts/[id]', params: { id: createdId } }); }, [createdId, dirty, busy, router]);
  const save = async () => {
    Keyboard.dismiss(); const success = await model.save(); const next = model.getSnapshot();
    if (success && next.id && !draftId) { workspace.adopt(next.id, model); setCreatedId(next.id); }
  };
  const remove = async () => { setConfirm(null); if (await model.remove()) { if (router.canGoBack()) router.back(); else router.replace('/drafts'); } };
  if (state.deleted) return <Screen><StateView title="Draft unavailable" description={state.error || 'This draft was deleted.'} actionLabel="Your drafts" onAction={() => router.replace('/drafts')} /></Screen>;
  if (!state.loaded) return <Screen><StateView loading={state.loading} title={state.loading ? 'Opening your draft' : 'Draft could not be opened'} description={state.error || 'Loading saved content and recipients.'}
    actionLabel={state.loading ? undefined : 'Try again'} onAction={() => { void model.reload(); }} /></Screen>;
  return <Screen>
    <Stack.Screen options={{ title: state.id ? 'Edit draft' : 'New draft', gestureEnabled: !busy,
      headerRight: () => <AppButton disabled={recipientPending || busy || state.uncertain || state.conflict || Boolean(state.id && !state.dirty)} onPress={() => { void save(); }}>Save</AppButton> }} />
    <AppButton disabled={busy} onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/drafts'); }}>Back to drafts</AppButton>
    <Text variant="headlineSmall" accessibilityRole="header">{state.id ? 'A message in progress' : 'What would you like to say?'}</Text>
    <Text accessibilityLiveRegion="polite" variant="bodyMedium">{state.loading ? 'Loading saved version…' : state.saving ? 'Saving…' : state.uncertain ? 'Save outcome uncertain' : state.dirty ? 'Unsaved changes — save before closing the app.' : state.savedAt ? `Saved · version ${state.version}` : 'Not saved yet'}</Text>
    <AppTextField label="Subject (optional)" value={state.content.subject ?? ''} onChangeText={(subject) => model.edit({ subject })} maxLength={160} disabled={busy} />
    <AppTextField label="Message" value={state.content.text} onChangeText={(text) => model.edit({ text })} multiline numberOfLines={6} maxLength={20000} disabled={busy} style={{ minHeight: 160 }} />
    <Text variant="bodySmall">{state.content.text.length}/20,000 characters</Text>
    <OccasionPicker value={state.content.occasion} onChange={(occasion) => model.edit({ occasion })} disabled={busy} />
    <RecipientEditor recipients={state.content.recipients} ownerId={user?.id ?? ''} onChange={(recipients) => model.edit({ recipients })} onEntryChange={setRecipientPending} disabled={busy} />
    {state.error ? <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>{state.error}</Text> : null}
    {state.conflict ? <><Text>This draft changed elsewhere. Your edits are still here. Reloading will discard them and open the saved version.</Text><AppButton disabled={busy} onPress={() => setConfirm('reload')}>Reload saved version</AppButton></> : null}
    {state.uncertain ? <><Text>We couldn’t confirm the save or deletion. Check saved drafts before creating another copy or trying again.</Text><AppButton disabled={busy} onPress={() => router.push('/drafts')}>Check saved drafts</AppButton>{state.id ? <AppButton disabled={busy} onPress={() => setConfirm('reload')}>Reload saved version</AppButton> : null}</> : null}
    <AppButton mode="contained" loading={state.saving} disabled={recipientPending || busy || state.uncertain || state.conflict || Boolean(state.id && !state.dirty)} onPress={() => { void save(); }}>Save draft</AppButton>
    {state.id ? <AppButton mode="outlined" disabled={busy || state.conflict || state.uncertain} onPress={() => setConfirm('delete')}>Delete draft</AppButton> : null}
    {state.id ? <AttachmentPanel draftId={state.id} disabled={state.saving || state.loading || state.deleting || state.uncertain || state.conflict} onGuardChange={setMediaGuard} /> : <Text>Save this draft first to add photos, videos, voice or files.</Text>}
    {state.id ? <AppButton mode="contained" disabled={busy || dirty || state.conflict} onPress={() => router.replace({pathname:'/schedules/new',params:{draftId:state.id}})}>Schedule this draft</AppButton> : null}
    <Text variant="bodyMedium">Save changes and finish uploads before scheduling. Automatic delivery is not running yet.</Text>
    <Portal>
      <Dialog visible={Boolean(repeat)} onDismiss={() => setRepeat(null)}>
        <Dialog.Title>{busy ? 'Please wait' : 'Discard local changes?'}</Dialog.Title>
        <Dialog.Content><Text>{busy ? 'Wait for the current request to finish before leaving.' : state.uncertain ? 'The server may already have a copy. Leave to check your drafts and discard these local edits?' : 'Your unsaved changes and selected file will be lost. Uploaded attachments stay saved.'}</Text></Dialog.Content>
        <Dialog.Actions><AppButton onPress={() => setRepeat(null)}>Keep editing</AppButton>{!busy ? <AppButton onPress={() => { const next = repeat; model.discard(); setRecipientPending(false); setMediaGuard({pending:false,busy:false}); setRepeat(null); next?.run(); }}>Discard and leave</AppButton> : null}</Dialog.Actions>
      </Dialog>
      <Dialog visible={confirm !== null} onDismiss={() => setConfirm(null)}>
        <Dialog.Title>{confirm === 'delete' ? 'Delete this draft?' : 'Reload saved version?'}</Dialog.Title>
        <Dialog.Content><Text>{confirm === 'delete' ? 'The draft and its recipients will be removed.' : 'Your local changes will be discarded. The latest saved version will replace them.'}</Text></Dialog.Content>
        <Dialog.Actions><AppButton onPress={() => setConfirm(null)}>Cancel</AppButton><AppButton onPress={() => { if (confirm === 'delete') void remove(); else { setConfirm(null); void model.reload(); } }}>{confirm === 'delete' ? 'Delete draft' : 'Reload draft'}</AppButton></Dialog.Actions>
      </Dialog>
    </Portal>
  </Screen>;
}
