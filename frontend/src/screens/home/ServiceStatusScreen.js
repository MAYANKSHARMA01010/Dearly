import { List, Text, useTheme } from 'react-native-paper';
import Screen from '../../components/layout/Screen';
import StateView from '../../components/common/StateView';
import AppButton from '../../components/common/AppButton';
import { useServiceHealth } from '../../hooks/useServiceHealth';

export default function ServiceStatusScreen() {
  const theme = useTheme();
  const { checking, report, error, check } = useServiceHealth();
  const ready = report?.serverAvailable && report.databaseAvailable;
  return (
    <Screen>
      <StateView
        loading={checking}
        title={checking ? 'Checking the connection' : ready ? 'Services are available' : 'Connection needs attention'}
        description={checking ? 'This should only take a moment.' : error || report?.message || 'Please try the check again.'}
      />
      <List.Section>
        <List.Item title="Server" description={checking ? 'Checking…' : report?.serverAvailable ? 'Available' : 'Unavailable'}
          left={(props) => <List.Icon {...props} icon="server-outline" />} />
        <List.Item title="Message storage" description={checking ? 'Checking…' : report?.databaseAvailable ? 'Available' : 'Unavailable'}
          left={(props) => <List.Icon {...props} icon="database-outline" />} />
      </List.Section>
      {!checking && report ? <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        Last checked at {new Date(report.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
      </Text> : null}
      <AppButton mode="contained" loading={checking} disabled={checking} onPress={() => { void check(); }}>
        {checking ? 'Checking' : 'Check again'}
      </AppButton>
    </Screen>
  );
}
