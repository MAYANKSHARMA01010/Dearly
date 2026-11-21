import NotificationBridge from '../components/common/NotificationBridge';
import { ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { getAppThemes } from '../theme';
import { AuthProvider, useAuth } from '../context/AuthContext';
import Screen from '../components/layout/Screen';
import StateView from '../components/common/StateView';
import AppButton from '../components/common/AppButton';
import { DraftWorkspaceProvider } from '../context/DraftWorkspaceContext';

function SessionNavigator() {
  const { status, user, message, recovery, session } = useAuth();
  const dark = useColorScheme() === 'dark';
  const themes = getAppThemes(dark);
  if (status === 'restoring' || status === 'blocked') return <Screen>
    <StateView loading={status === 'restoring'} title={status === 'restoring' ? 'Restoring your session' : 'Session needs attention'}
      description={message || 'Checking your account before opening Dearly.'} />
    {status === 'blocked' ? <>
      {recovery !== 'storage' ? <AppButton mode="contained" onPress={() => { void session.restore(); }}>Retry connection</AppButton> : null}
      <AppButton onPress={() => { void session.logout().catch(() => {}); }}>Sign out on this device</AppButton>
    </> : null}
  </Screen>;
  return <Stack screenOptions={{
    headerShadowVisible: false,
    headerTintColor: themes.paper.colors.onSurface,
    headerStyle: { backgroundColor: themes.paper.colors.surface },
    contentStyle: { backgroundColor: themes.paper.colors.background },
  }}>
    <Stack.Screen name="index" options={{ title: 'Dearly', headerBackVisible: false, headerShown: Boolean(user) }} />
    <Stack.Screen name="status" options={{ title: 'Service status' }} />
    <Stack.Protected guard={!user}>
      <Stack.Screen name="login" options={{ title: 'Sign in' }} />
    </Stack.Protected>
    <Stack.Protected guard={Boolean(user)}>
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="profile" options={{ title: 'Your profile' }} />
      <Stack.Screen name="drafts" options={{ headerShown: false }} />
      <Stack.Screen name="mailboxes" options={{ headerShown: false }} />
      <Stack.Screen name="schedules" options={{ headerShown: false }} />
    </Stack.Protected>
    <Stack.Screen name="+not-found" options={{ title: 'Page not found' }} />
  </Stack>;
}

export default function RootLayout() {
  const dark = useColorScheme() === 'dark';
  const themes = getAppThemes(dark);
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <PaperProvider theme={themes.paper}>
        <ThemeProvider value={themes.navigation}>
          <StatusBar style={dark ? 'light' : 'dark'} />
          <AuthProvider><DraftWorkspaceProvider><SessionNavigator /><NotificationBridge /></DraftWorkspaceProvider></AuthProvider>
        </ThemeProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
