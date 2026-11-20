import { Divider, Icon, List, Text, useTheme } from 'react-native-paper';
import Screen from '../../components/layout/Screen';
import { InsetGroup } from '../../components/layout/ScreenSections';
import StateView from '../../components/common/StateView';
import AppButton from '../../components/common/AppButton';
import { useServiceHealth } from '../../hooks/useServiceHealth';

export default function ServiceStatusScreen() {
  const theme = useTheme();
  const { checking, report, error, check } = useServiceHealth();
  const ready = report?.serverAvailable && report.databaseAvailable;
  return (
    <Screen>
      <Icon source={checking ? "connection" : ready ? "check-network-outline" : "alert-circle-outline"} size={36} color={!checking && !ready ? theme.colors.error : theme.colors.primary} />
      <StateView
        loading={checking}
        title={checking ? 'Checking the connection' : ready ? 'Connected to Dearly' : 'Connection needs attention'}
        description={checking ? 'This should only take a moment.' : error || report?.message || 'Please try the check again.'}
      />
      <InsetGroup>
        <List.Item accessible={false} title="Server" style={{ minHeight: 80 }} description={checking ? 'Checking…' : report?.serverAvailable ? 'Available' : 'Unavailable'}
          left={(props) => <List.Icon {...props} icon="server-outline" />} />
        <Divider />
        <List.Item accessible={false} title="Message storage" style={{ minHeight: 80 }} description={checking ? 'Checking…' : report?.databaseAvailable ? 'Available' : 'Unavailable'}
          left={(props) => <List.Icon {...props} icon="database-outline" />} />
      </InsetGroup>
      {!checking && report ? <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        Last checked at {new Date(report.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
      </Text> : null}
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>This checks the server and message storage. Delivery channels are checked when you review a schedule.</Text>
      <AppButton icon="refresh" mode="contained" loading={checking} disabled={checking} onPress={() => { void check(); }}>
        {checking ? 'Checking' : 'Check again'}
      </AppButton>
    </Screen>
  );
}
