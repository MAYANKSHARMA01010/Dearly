import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { Dialog, List, Portal, ProgressBar, Text, useTheme } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import AppButton from '../common/AppButton';
import { InlineNotice } from '../layout/ScreenSections';
import VoiceRecorder from './VoiceRecorder';
import AttachmentViewer from './AttachmentViewer';
import AttachmentRow from './AttachmentRow';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../api/client';
import { createAttachmentService, completeUpload } from '../../services/attachments/service';
import { copySelection, discardLocal, uploadFile, downloadFile } from '../../services/attachments/device';
import { limits, MiB } from '../../services/attachments/contracts';
import { spacing } from '../../theme';

/** @typedef {import('../../services/attachments/contracts').Attachment} Attachment */
/** @typedef {import('../../services/attachments/contracts').Selection} Selection */
/** @param {{draftId:string, disabled:boolean, onGuardChange:(guard:{pending:boolean,busy:boolean})=>void, readOnly?:boolean}} props */
export default function AttachmentPanel({ draftId, disabled, onGuardChange, readOnly=false }) {
  const { session } = useAuth(); const theme = useTheme();
  const api = useMemo(() => createAttachmentService(session, draftId), [session, draftId]);
  const [items, setItems] = useState(/** @type {Attachment[]} */ ([])); const [selected, setSelected] = useState(/** @type {Selection|null} */ (null));
  const [preview, setPreview] = useState(/** @type {{item:Pick<Attachment,'name'|'mime'|'bytes'>,uri:string}|null} */ (null));
  const [confirm, setConfirm] = useState(/** @type {Attachment|null} */ (null));
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [progress, setProgress] = useState(0); const [loaded, setLoaded] = useState(false);
  const [recording, setRecording] = useState(false);
  const active = useRef(/** @type {AbortController|null} */ (null)); const mounted = useRef(true);
  const local = useRef(/** @type {Selection|null} */ (null)); const viewed = useRef('');
  useEffect(() => { onGuardChange({ pending:Boolean(selected) || recording, busy:Boolean(busy) || recording }); }, [selected, recording, busy, onGuardChange]);
  const run = useCallback(/** @param {string} label @param {(signal:AbortSignal)=>Promise<void>} work */ async (label, work) => {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(label); setProgress(0); setError('');
    try { await work(controller.signal); }
    catch (failure) { if (mounted.current) setError(controller.signal.aborted ? 'Transfer canceled. Refresh attachments before retrying with the same selection.' : failure instanceof ApiError ? failure.message : 'This attachment action could not finish. Refresh and try again.'); }
    finally { if (active.current === controller) active.current = null; if (mounted.current) setBusy(''); }
  }, []);
  const refresh = useCallback(() => run('Loading attachments', async (signal) => { const next = await api.list(signal); if (!signal.aborted) { setItems(next); setLoaded(true); } }), [api, run]);
  useEffect(() => {
    mounted.current = true; void refresh();
    return () => { mounted.current = false; active.current?.abort(); if (local.current) void discardLocal(local.current.uri); if (viewed.current) void discardLocal(viewed.current); };
  }, [refresh]);
  const choose = useCallback(/** @param {{uri:string,name:string,mime?:string|null,file?:File}} input @param {AbortSignal} [signal] */ async (input, signal) => {
    const file = await copySelection(input);
    if (!mounted.current || signal?.aborted) { await discardLocal(file.uri); return; }
    if (local.current) await discardLocal(local.current.uri);
    local.current = file; setSelected(file);
  }, []);
  const receiveVoice = useCallback(/** @param {string} uri */ async (uri) => {
    if (Platform.OS === 'web') {
      const blob = await (await fetch(uri)).blob();
      await choose({ uri, name:'Voice note.webm', mime:'audio/webm', file:new File([blob], 'Voice note.webm', {type:'audio/webm'}) });
    } else await choose({ uri, name:'Voice note.m4a', mime:'audio/mp4' });
  }, [choose]);
  const pickMedia = () => run('Choosing photo or video', async (signal) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes:['images','videos'], allowsMultipleSelection:false, quality:1, videoExportPreset:ImagePicker.VideoExportPreset.HighestQuality, preferredAssetRepresentationMode:ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible, videoMaxDuration:120 });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0]; await choose({ uri:a.uri, name:a.fileName || (a.type === 'video' ? 'Video.mp4' : 'Photo.jpg'), mime:a.mimeType, file:a.file }, signal);
    }
  });
  const pickFile = () => run('Choosing a file', async (signal) => {
    const result = await DocumentPicker.getDocumentAsync({ type:Object.keys(limits), multiple:false, copyToCacheDirectory:true });
    if (!result.canceled && result.assets[0]) { const a = result.assets[0]; await choose({ uri:a.uri, name:a.name, mime:a.mimeType, file:a.file }, signal); }
  });
  const upload = () => run('Uploading and validating', async (signal) => {
    const file = local.current; if (!file) return;
    await completeUpload({ api, selection:file, signal, upload:() => uploadFile(session, api.contentPath(file.id), file, signal, (value) => { if (mounted.current) setProgress(value); }) });
    if (signal.aborted || !mounted.current) return;
    local.current = null; setSelected(null); await discardLocal(file.uri);
    const next = await api.list(signal); if (!signal.aborted) { setItems(next); setLoaded(true); }
  });
  /** @param {Attachment} item */
  const view = (item) => run('Opening private attachment', async (signal) => {
    const uri = await downloadFile(session, api.contentPath(item.id), item, signal, (value) => { if (mounted.current) setProgress(value); });
    if (signal.aborted || !mounted.current) { await discardLocal(uri); return; }
    if (viewed.current) await discardLocal(viewed.current); viewed.current = uri; setPreview({ item, uri });
  });
  const remove = () => {
    const item = confirm; setConfirm(null); if (!item) return;
    void run('Removing attachment', async (signal) => {
      await api.remove(item.id, signal);
      if (local.current?.id === item.id) { await discardLocal(local.current.uri); local.current = null; if (mounted.current) setSelected(null); }
      const next = await api.list(signal); if (!signal.aborted) setItems(next);
    });
  };
  /** @param {Attachment} item */
  const finalize = (item) => run('Validating attachment', async (signal) => { await api.finalize(item.id, signal); const next = await api.list(signal); if (!signal.aborted) setItems(next); });
  return <View style={{ gap:spacing.md }}>
    <Text variant="titleLarge" accessibilityRole="header">Attachments ({items.length}/10)</Text>
    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Private until delivery. Up to 10 attachments and 100 MB per draft.</Text>
    <List.Accordion title="File types and limits" titleStyle={{ color: theme.colors.onSurfaceVariant }} style={{ backgroundColor: theme.colors.background }}>
      <View style={{ gap: spacing.sm, padding: spacing.md }}>
        <Text variant="bodySmall">Photos/audio: 10 MB. Videos: 50 MB and 2 minutes. Voice/audio: 5 minutes. PDF: 20 MB. Text: 1 MB.</Text>
        <Text variant="bodySmall">JPEG, PNG, WebP · MP4, MOV, WebM · M4A, MP3, WAV · PDF, text</Text>
      </View>
    </List.Accordion>
    {!items.length && loaded ? <Text>No saved attachments yet.</Text> : null}
    {items.map((item) => <View key={item.id} style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant }}>
      {item.state === 'READY' ? <AttachmentRow name={item.name} mime={item.mime} bytes={item.bytes}
        disabled={disabled || Boolean(busy) || recording} onPress={() => { void view(item); }} /> :
        <View style={{ padding: spacing.md, gap: spacing.sm }}><Text variant="titleMedium">{item.name}</Text>
          <Text>{(item.bytes/MiB).toFixed(2)} MB · {item.state === 'UPLOADED' ? 'Uploaded — validation needed' : item.state === 'UPLOADING' ? 'Upload active or interrupted — refresh status' : 'Awaiting upload'}</Text></View>}
      {!readOnly ? <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {item.state === 'UPLOADED' ? <AppButton disabled={disabled || Boolean(busy) || recording} onPress={() => { void finalize(item); }}>Validate attachment</AppButton> : null}
        <AppButton icon="trash-can-outline" textColor={theme.colors.error} disabled={disabled || Boolean(busy) || recording} onPress={() => setConfirm(item)} accessibilityLabel={`Remove ${item.name}`}>Remove</AppButton>
      </View> : null}
    </View>)}
    {preview ? <AttachmentViewer uri={preview.uri} mime={preview.item.mime} name={preview.item.name}
      onClose={() => { const uri = viewed.current; viewed.current = ''; setPreview(null); if (uri) void discardLocal(uri); }} /> : null}
    {!readOnly ? <>
    <AppButton icon="image-multiple-outline" mode="outlined" disabled={disabled || Boolean(busy) || recording || Boolean(selected) || items.length >= 10} onPress={() => { void pickMedia(); }}>Choose photo or video</AppButton>
    <AppButton icon="file-upload-outline" mode="outlined" disabled={disabled || Boolean(busy) || recording || Boolean(selected) || items.length >= 10} onPress={() => { void pickFile(); }}>Choose file or audio</AppButton>
    <VoiceRecorder disabled={disabled || Boolean(busy) || Boolean(selected) || items.length >= 10} onReady={receiveVoice} onPending={setRecording} />
    {selected ? <View style={{ gap:spacing.sm }}>
      <Text variant="titleMedium">Ready to upload</Text>
      <AttachmentRow name={selected.name} mime={selected.mime} bytes={selected.bytes} subtitle="Not saved yet · Tap to preview"
        disabled={Boolean(busy)} onPress={() => setPreview({ item: selected, uri: selected.uri })} />
      <AppButton mode="contained" disabled={disabled || Boolean(busy) || recording} onPress={() => { void upload(); }}>Upload selected file</AppButton>
      <AppButton disabled={Boolean(busy)} onPress={() => { const file = local.current; local.current = null; setSelected(null); if (file) void discardLocal(file.uri); }}>Discard selected file</AppButton></View> : null}
    </> : null}
    {busy ? <><Text accessibilityLiveRegion="polite">{busy}{busy.includes('Uploading') || busy.includes('Opening') ? ` · ${Math.round(progress*100)}% transferred` : '…'}</Text><ProgressBar progress={progress} accessibilityLabel={busy} />
      <AppButton onPress={() => active.current?.abort()}>Cancel current action</AppButton></> : null}
    {error ? <InlineNotice error>{error}</InlineNotice> : null}
    <AppButton icon="refresh" disabled={Boolean(busy) || recording} onPress={() => { void refresh(); }}>Refresh attachments</AppButton>
    {!readOnly ? <Text variant="bodySmall" style={{ color:theme.colors.onSurfaceVariant }}>Uploads save separately from message text. Abandoned uploads expire after 24 hours. Microphone permission is requested only when you tap Record voice.</Text> : null}
    <Portal><Dialog visible={confirm !== null} onDismiss={() => setConfirm(null)}><Dialog.Title>Remove attachment?</Dialog.Title><Dialog.Content><Text>{confirm?.name} will be removed from this draft. An active transfer must finish or expire first.</Text></Dialog.Content><Dialog.Actions><AppButton onPress={() => setConfirm(null)}>Keep attachment</AppButton><AppButton onPress={remove}>Remove attachment</AppButton></Dialog.Actions></Dialog></Portal>
  </View>;
}
