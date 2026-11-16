import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
import { Text } from 'react-native-paper';
import { RecordingPresets, useAudioRecorder, useAudioRecorderState, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import AppButton from '../common/AppButton';
import { discardRecording } from '../../services/attachments/device';
import { spacing } from '../../theme';

/** @param {{ disabled:boolean, onReady:(uri:string)=>Promise<void>, onPending:(pending:boolean)=>void }} props */
export default function VoiceRecorder({ disabled, onReady, onPending }) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory:'cache' }); const status = useAudioRecorderState(recorder, 250);
  const [isActive, setIsActive] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [denied, setDenied] = useState(false);
  const active = useRef(false); const mounted = useRef(true); const starting = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background' && active.current) {
        active.current = false; setIsActive(false); void recorder.stop().catch(() => {}).finally(() => { if (recorder.uri) void discardRecording(recorder.uri); void setAudioModeAsync({allowsRecording:false}).catch(() => {}); }); onPending(false); setError('Recording stopped when Dearly moved to the background. Record it again.');
      }
    });
    return () => { mounted.current = false; subscription.remove(); active.current = false; void setAudioModeAsync({ allowsRecording:false }).catch(() => {}); };
  }, [recorder, onPending]);
  const start = async () => {
    if (starting.current || active.current || disabled) return;
    starting.current = true; setBusy(true); setError(''); onPending(true);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!mounted.current) return;
      if (!permission.granted) { setDenied(true); setError('Microphone access is off. You can enable it in Settings, or choose an audio file instead.'); return; }
      setDenied(false); await setAudioModeAsync({ allowsRecording:true, playsInSilentMode:true, shouldPlayInBackground:false });
      await recorder.prepareToRecordAsync({...RecordingPresets.HIGH_QUALITY,directory:'cache',fileName:`dearly-voice-${Date.now()}`});
      if (!mounted.current) return;
      active.current = true; setIsActive(true); onPending(true); recorder.record({ forDuration:299 });
    } catch { active.current = false; if (mounted.current) { setIsActive(false); setError('Recording could not start. Check microphone access and try again.'); } }
    finally { starting.current = false; if (mounted.current) { setBusy(false); if (!active.current) onPending(false); } }
  };
  const finish = useCallback(async (keep = true) => {
    if (starting.current || !active.current) return;
    starting.current = true; setBusy(true);
    try {
      active.current = false; setIsActive(false); if (recorder.getStatus().isRecording) await recorder.stop(); await setAudioModeAsync({ allowsRecording:false });
      if (keep && recorder.uri && mounted.current) await onReady(recorder.uri);
      if (recorder.uri) await discardRecording(recorder.uri);
    } catch { if (mounted.current) setError('Recording could not be kept. Please record again.'); }
    finally { starting.current = false; if (mounted.current) { onPending(false); setBusy(false); } }
  }, [recorder, onReady, onPending]);
  useEffect(() => {
    if (active.current && (status.durationMillis >= 298000 || status.fileSize >= 9 * 1024 * 1024)) void finish();
  }, [status.durationMillis, status.fileSize, finish]);
  return <View style={{ gap:spacing.sm }}>
    <Text variant="titleMedium">Voice note</Text>
    <Text>{status.isRecording ? `Recording · ${Math.floor(status.durationMillis / 1000)} seconds` : 'Record up to 5 minutes. Review it before uploading.'}</Text>
    {isActive || status.isRecording ? <><AppButton disabled={busy} onPress={() => { void finish(); }}>Stop and review voice</AppButton><AppButton disabled={busy} onPress={() => { void finish(false); }}>Cancel recording</AppButton></> : <AppButton mode="outlined" disabled={disabled || busy} loading={busy} onPress={() => { void start(); }}>Record voice</AppButton>}
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    {denied ? <AppButton onPress={() => { void Linking.openSettings().catch(() => setError('Open your device Settings to enable microphone access.')); }}>Open microphone settings</AppButton> : null}
  </View>;
}
