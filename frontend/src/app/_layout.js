import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { getAppThemes } from '../theme';

export default function RootLayout() {
  const dark = useColorScheme() === 'dark';
  const themes = getAppThemes(dark);
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <PaperProvider theme={themes.paper}>
        <ThemeProvider value={themes.navigation}>
          <StatusBar style={dark ? 'light' : 'dark'} />
          <Stack screenOptions={{
            headerShadowVisible: false,
            headerTintColor: themes.paper.colors.onSurface,
            headerStyle: { backgroundColor: themes.paper.colors.surface },
            contentStyle: { backgroundColor: themes.paper.colors.background },
          }}>
            <Stack.Screen name="index" options={{ title: 'Dearly' }} />
            <Stack.Screen name="status" options={{ title: 'Service status' }} />
            <Stack.Screen name="+not-found" options={{ title: 'Page not found' }} />
          </Stack>
        </ThemeProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
