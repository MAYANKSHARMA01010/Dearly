import { useCallback } from 'react';
import DashboardScreen from '../mailboxes/DashboardScreen';
import { View } from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { Divider, Icon, Text, useTheme } from 'react-native-paper';
import Screen from '../../components/layout/Screen';
import AppButton from '../../components/common/AppButton';
import { spacing } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/auth/authService';

export default function HomeScreen() {
  const router = useRouter(), theme = useTheme();
  const { user, message } = useAuth();
  useFocusEffect(useCallback(() => {
    if (user) return;
    const controller = new AbortController();
    void authService.prepareOtp(controller.signal).catch(() => {});
    return () => controller.abort();
  }, [user]));
  if (user && !user.name) return <Redirect href="/profile" />;
  if (user) return <DashboardScreen />;
  return <Screen includeTopInset>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}>
      <Icon source="email-heart-outline" size={28} color={theme.colors.primary} />
      <Text variant="titleLarge" style={{ fontWeight: '600' }}>Dearly</Text>
    </View>
    <View style={{ flex: 1, justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.lg }}>
      <Text variant="headlineLarge" accessibilityRole="header" style={{ fontWeight: '600' }}>A message for their tomorrow.</Text>
      <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>Save a thought, photo or voice note. Choose who receives it and when.</Text>
      <View style={{ borderWidth: 1, borderColor: theme.colors.outlineVariant, borderRadius: 16, padding: spacing.lg, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Icon source="heart-outline" size={20} color={theme.colors.primary} />
          <Text variant="titleSmall">For someone you love</Text>
        </View>
        <Text variant="titleLarge">A little reminder: you’ve got this.</Text>
        <Divider />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Icon source="calendar-clock-outline" size={20} color={theme.colors.onSurfaceVariant} />
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Delivered on your chosen date</Text>
        </View>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Example message</Text>
      </View>
    </View>
    <View style={{ gap: spacing.sm }}>
      {message ? <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.onSurfaceVariant }}>{message}</Text> : null}
      <AppButton mode="contained" onPress={() => router.push('/login')}>Get started</AppButton>
      <Text variant="bodySmall" style={{ textAlign: 'center', color: theme.colors.onSurfaceVariant }}>Sign in or create an account with your phone number.</Text>
      <AppButton onPress={() => router.push('/status')}>Service status</AppButton>
    </View>
  </Screen>;
}
