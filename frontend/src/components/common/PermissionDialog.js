import { Dialog, Portal, Text } from 'react-native-paper';
import AppButton from './AppButton';

/** @param {{kind:'microphone'|'notifications'|null,onChoice:(allow:boolean)=>void}} props */
export default function PermissionDialog({ kind, onChoice }) {
  if (kind === null) return null;
  const microphone = kind === 'microphone';
  return <Portal><Dialog style={{ borderRadius: 16 }} visible={kind !== null} onDismiss={() => onChoice(false)}>
    <Dialog.Title>{microphone ? 'Record a voice note?' : 'Get message updates?'}</Dialog.Title>
    <Dialog.Content><Text>{microphone
      ? 'Dearly needs microphone access to record your voice note. You can review it before uploading. You can also choose an audio file instead.'
      : 'Allow notifications for message activity. Alerts don’t show private message content. You can keep using Dearly without enabling them.'}</Text></Dialog.Content>
    <Dialog.Actions style={{ flexWrap: 'wrap' }}>
      <AppButton onPress={() => onChoice(false)}>Not now</AppButton>
      <AppButton onPress={() => onChoice(true)}>{microphone ? 'Use microphone' : 'Enable notifications'}</AppButton>
    </Dialog.Actions>
  </Dialog></Portal>;
}
