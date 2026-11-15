import { View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { spacing } from '../../theme';
import AppButton from './AppButton';

/** @param {{ title: string, description: string, loading?: boolean, actionLabel?: string, onAction?: () => void }} props */
export default function StateView({ title, description, loading = false, actionLabel, onAction }) {
  const theme = useTheme();
  return (
    <View style={{ gap: spacing.md }} accessibilityLiveRegion="polite">
      {loading ? <ActivityIndicator accessibilityLabel="Checking service status" /> : null}
      <Text variant="headlineSmall" accessibilityRole="header">{title}</Text>
      <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>{description}</Text>
      {actionLabel && onAction ? <AppButton mode="contained" onPress={onAction}>{actionLabel}</AppButton> : null}
    </View>
  );
}
