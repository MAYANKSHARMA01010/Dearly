import { Stack } from 'expo-router';
import { useTheme } from 'react-native-paper';
export default function MailboxLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTintColor: theme.colors.onSurface,
        headerStyle: { backgroundColor: theme.colors.surface },
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Your mailboxes' }} />
      <Stack.Screen name="owned/[id]" options={{ title: 'Message details' }} />
      <Stack.Screen
        name="received/[id]"
        options={{ title: 'Received message' }}
      />
    </Stack>
  );
}
