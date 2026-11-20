import { View } from 'react-native';
import { Icon, Text, TouchableRipple, useTheme } from 'react-native-paper';
import { spacing } from '../../theme';

/** @param {string} mime */
export function mediaIdentity(mime) {
  if (mime.startsWith('image/')) return { label: 'Photo', icon: 'image-outline' };
  if (mime.startsWith('video/')) return { label: 'Video', icon: 'video-outline' };
  if (mime.startsWith('audio/')) return { label: 'Audio', icon: 'music-note-outline' };
  return { label: mime === 'application/pdf' ? 'PDF document' : 'Text document', icon: 'file-document-outline' };
}

/** @param {{name:string,mime:string,bytes:number,subtitle?:string,disabled?:boolean,onPress:()=>void}} props */
export default function AttachmentRow({ name, mime, bytes, subtitle, disabled, onPress }) {
  const theme = useTheme(), media = mediaIdentity(mime);
  return <TouchableRipple disabled={disabled} onPress={onPress} accessibilityRole="button"
    accessibilityLabel={`Open ${media.label.toLowerCase()}: ${name}`} style={{ borderRadius: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: theme.colors.surfaceVariant, alignItems: 'center', justifyContent: 'center' }}>
        <Icon source={media.icon} size={24} color={theme.colors.onSurfaceVariant} />
      </View>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text variant="titleSmall" numberOfLines={2}>{name}</Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{subtitle || `${media.label} · ${(bytes / (1024 * 1024)).toFixed(2)} MB`}</Text>
      </View>
      <Icon source="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
    </View>
  </TouchableRipple>;
}
