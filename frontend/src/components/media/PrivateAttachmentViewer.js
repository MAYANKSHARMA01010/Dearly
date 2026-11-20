import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { ProgressBar, Text } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { downloadFile, discardLocal } from '../../services/attachments/device';
import AttachmentViewer from './AttachmentViewer';
import AttachmentRow from './AttachmentRow';
import { InlineNotice } from '../layout/ScreenSections';
import { spacing } from '../../theme';
/** @param {{items:import('../../services/attachments/contracts').Attachment[],contentPath:(id:string)=>string}} props */
export default function PrivateAttachmentViewer({ items, contentPath }) {
  const { session } = useAuth();
  const action = useAsyncAction();
  const [progress, setProgress] = useState(0),
    [preview, setPreview] = useState(
      /** @type {{uri:string,item:import('../../services/attachments/contracts').Attachment}|null} */ (
        null
      ),
    );
  const cached = useRef('');
  useEffect(
    () => () => {
      if (cached.current) void discardLocal(cached.current);
    },
    [],
  );
  /** @param {import('../../services/attachments/contracts').Attachment} item */
  const open = (item) =>
    action.run(async (signal) => {
      setProgress(0);
      const uri = await downloadFile(
        session,
        contentPath(item.id),
        item,
        signal,
        (v) => {
          if (!signal.aborted) setProgress(v);
        },
      );
      if (signal.aborted) {
        await discardLocal(uri);
        return;
      }
      if (cached.current) await discardLocal(cached.current);
      cached.current = uri;
      setPreview({ uri, item });
    });
  return (
    <View style={{ gap: spacing.md }}>
      <Text variant="titleLarge" accessibilityRole="header">
        Attachments ({items.length})
      </Text>
      {!items.length ? <Text>No attachments.</Text> : null}
      {items.map((item) => (
        <AttachmentRow key={item.id} name={item.name} mime={item.mime} bytes={item.bytes}
          disabled={action.busy} onPress={() => { void open(item); }} />
      ))}
      {action.busy ? (
        <>
          <Text accessibilityLiveRegion="polite">
            Opening private attachment · {Math.round(progress * 100)}%
          </Text>
          <ProgressBar progress={progress} />
        </>
      ) : null}
      {action.error ? (
        <InlineNotice error>
          {action.error}
        </InlineNotice>
      ) : null}
      {preview ? (
        <AttachmentViewer uri={preview.uri} mime={preview.item.mime} name={preview.item.name}
          onClose={() => {
            const uri = cached.current;
            cached.current = '';
            setPreview(null);
            void discardLocal(uri);
          }} />
      ) : null}
    </View>
  );
}
