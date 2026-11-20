import { Modal, View } from 'react-native';
import { IconButton, PaperProvider, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import MediaPreview from './MediaPreview';
import { mediaIdentity } from './AttachmentRow';
import { darkTheme, spacing } from '../../theme';

/** @param {{uri:string,mime:string,name:string,onClose:()=>void}} props */
export default function AttachmentViewer({ uri, mime, name, onClose }) {
  const theme = useTheme();
  // Photos and video need a stable viewing surround, independent of app appearance.
  const immersive = mime.startsWith('image/') || mime.startsWith('video/');
  const viewerTheme = immersive ? darkTheme : theme;
  return <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}
    supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}>
    <PaperProvider theme={viewerTheme}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: viewerTheme.colors.background }}>
        <SafeAreaView style={{ flex: 1 }}>
          <StatusBar style={viewerTheme.dark ? 'light' : 'dark'} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: spacing.md, paddingVertical: spacing.xs, gap: spacing.sm }}>
            <IconButton icon="close" size={24} accessibilityLabel="Close attachment" onPress={onClose} style={{ width: 48, height: 48 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="titleMedium" numberOfLines={1} accessibilityRole="header">{name}</Text>
              <Text variant="bodySmall" style={{ color: viewerTheme.colors.onSurfaceVariant }}>{mediaIdentity(mime).label}</Text>
            </View>
          </View>
          <MediaPreview key={uri} uri={uri} mime={mime} name={name} />
        </SafeAreaView>
      </GestureHandlerRootView>
    </PaperProvider>
  </Modal>;
}
