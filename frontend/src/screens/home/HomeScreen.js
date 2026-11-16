import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Divider, Text, useTheme } from 'react-native-paper';
import Screen from '../../components/layout/Screen';
import AppButton from '../../components/common/AppButton';
import { spacing } from '../../theme';

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  return (
    <Screen>
      <View className="flex-1 justify-center" style={{ gap: spacing.lg, paddingVertical: spacing.xxl }}>
        <Text variant="displaySmall" accessibilityRole="header">For a moment{ '\n' }that matters.</Text>
        <Text variant="titleLarge" style={{ color: theme.colors.primary }}>Some messages are worth waiting for.</Text>
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
          A thought for your future self. A birthday wish. A little love, saved for the right day.
        </Text>
        <Divider style={{ marginVertical: spacing.sm }} />
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          Your space is taking shape. Creating and scheduling messages will be available in a future update.
        </Text>
      </View>
      <AppButton mode="contained" onPress={() => router.push('/status')}>Check service status</AppButton>
    </Screen>
  );
}
