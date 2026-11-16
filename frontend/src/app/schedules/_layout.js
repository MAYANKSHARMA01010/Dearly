import { Stack } from 'expo-router';
import { useTheme } from 'react-native-paper';
export default function ScheduleLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Schedules' }} />
      <Stack.Screen name="new" options={{ title: 'Review schedule' }} />
      <Stack.Screen name="[id]" options={{ title: 'Scheduled message' }} />
      <Stack.Screen name="reschedule" options={{ title: 'Reschedule' }} />
    </Stack>
  );
}
