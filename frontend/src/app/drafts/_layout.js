import { Stack } from 'expo-router';
import { useTheme } from 'react-native-paper';
export default function DraftLayout() {
  const theme = useTheme();
  return <Stack screenOptions={{ headerShadowVisible: false, headerTintColor: theme.colors.onSurface, headerStyle: { backgroundColor: theme.colors.surface }, contentStyle: { backgroundColor: theme.colors.background } }}>
    <Stack.Screen name="index" options={{ title: 'Drafts' }} />
    <Stack.Screen name="new" options={{ title: 'New draft' }} />
    <Stack.Screen name="[id]" options={{ title: 'Edit draft' }} />
  </Stack>;
}
