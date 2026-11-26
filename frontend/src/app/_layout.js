import NotificationBridge from '../components/common/NotificationBridge';
import { ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Modal, View, useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { getAppThemes } from '../theme';
import { AuthProvider, useAuth } from '../context/AuthContext';
import Screen from '../components/layout/Screen';
import StateView from '../components/common/StateView';
import AppButton from '../components/common/AppButton';
import BrandLockup from '../components/common/BrandLockup';
import { DraftWorkspaceProvider } from '../context/DraftWorkspaceContext';

function SessionNavigator() {
  const { status, user, message, recovery, session } = useAuth();
  const dark = useColorScheme() === 'dark';
  const themes = getAppThemes(dark);
  const locked = status === 'restoring' || status === 'blocked';
  // Keep the same Stack mounted through foreground verification. Returning from
  // Android pickers/permission activities must not dispose the editor or players.
  return <View style={{ flex: 1 }}>
    <View style={{ flex: 1, opacity: locked ? 0 : 1 }} pointerEvents={locked ? 'none' : 'auto'}
      accessibilityElementsHidden={locked} importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}>
    <Stack screenOptions={{
    headerShadowVisible: false,
    headerTintColor: themes.paper.colors.onSurface,
    headerStyle: { backgroundColor: themes.paper.colors.surface },
    contentStyle: { backgroundColor: themes.paper.colors.background },
  }}>
    <Stack.Screen name="index" options={{ title: 'Dearly', headerTitle: () => <BrandLockup />, headerBackVisible: false, headerShown: Boolean(user) }} />
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
    </Stack>
    </View>
    <Modal visible={locked} animationType="none" onRequestClose={() => {}}>
      <Screen includeTopInset>
        <StateView loading={status === 'restoring'} title={status === 'restoring' ? (user ? 'Checking your session' : 'Restoring your session') : 'Session needs attention'}
          description={message || (user ? 'Your place is saved while we check your account.' : 'Checking your account before opening Dearly.')} />
        {status === 'blocked' ? <>
          {recovery !== 'storage' ? <AppButton mode="contained" onPress={() => { void session.restore({ preserveNavigation: true }); }}>Retry connection</AppButton> : null}
          <AppButton onPress={() => { void session.logout().catch(() => {}); }}>Sign out on this device</AppButton>
        </> : null}
      </Screen>
    </Modal>
  </View>;
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
