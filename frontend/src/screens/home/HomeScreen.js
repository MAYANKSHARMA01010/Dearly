import { View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Divider, Text, useTheme } from 'react-native-paper';
import Screen from '../../components/layout/Screen';
import AppButton from '../../components/common/AppButton';
import { spacing } from '../../theme';
import { useAuth } from '../../context/AuthContext';

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { user, message } = useAuth();
  if (user && !user.name) return <Redirect href="/profile" />;
  return (
    <Screen>
      <View className="flex-1 justify-center" style={{ gap: spacing.lg, paddingVertical: spacing.xxl }}>
        <Text variant="displaySmall" accessibilityRole="header">{user ? `Hello, ${user.name}` : <>For a moment{ '\n' }that matters.</>}</Text>
        <Text variant="titleLarge" style={{ color: theme.colors.primary }}>Some messages are worth waiting for.</Text>
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
          A thought for your future self. A birthday wish. A little love, saved for the right day.
        </Text>
        <Divider style={{ marginVertical: spacing.sm }} />
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {user ? 'Write and save a private draft with photos, video, voice or files. Scheduling and sending will come in later updates.' : 'Sign in to start a private draft. Scheduling and sending will come in later updates.'}
        </Text>
      </View>
      {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
      {user ? <AppButton mode="contained" onPress={() => router.push('/drafts')}>Your drafts</AppButton> : null}
      <AppButton mode={user ? 'outlined' : 'contained'} onPress={() => router.push(user ? '/profile' : '/login')}>{user ? 'Your profile' : 'Sign in with your phone'}</AppButton>
      <AppButton mode="outlined" onPress={() => router.push('/status')}>Check service status</AppButton>
    </Screen>
  );
}
