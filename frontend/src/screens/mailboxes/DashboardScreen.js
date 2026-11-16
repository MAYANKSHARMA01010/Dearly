import { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { List, Text, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useFocusedResource } from '../../hooks/useFocusedResource';
import { createMailboxService } from '../../services/mailboxes/service';
import { boxes, boxLabels } from '../../services/mailboxes/contracts';
import Screen from '../../components/layout/Screen';
import AppButton from '../../components/common/AppButton';
import StateView from '../../components/common/StateView';
import { spacing } from '../../theme';
export default function DashboardScreen() {
  const { session, user } = useAuth(),
    router = useRouter(),
    theme = useTheme();
  const api = useMemo(() => createMailboxService(session), [session]);
  const { data, loading, error, refresh } = useFocusedResource(
    useCallback((signal) => api.dashboard(signal), [api]),
  );
  const descriptions =
    /** @type {Record<import('../../services/mailboxes/contracts').Box,string>} */ ({
      created: 'Everything you created, including drafts and canceled plans',
      scheduled: 'Waiting for delivery to start',
      sent: 'At least one recipient received this in app',
      received: data
        ? `${data.unopened} not marked as opened`
        : 'Messages delivered to you',
      drafts: 'Private messages you are still writing',
      failed: 'Failed and partially delivered messages',
    });
  return (
    <Screen>
      <Text variant="headlineMedium" accessibilityRole="header">
        Hello, {user?.name || 'there'}
      </Text>
      <Text variant="bodyLarge">A place for words worth keeping.</Text>
      <AppButton mode="contained" onPress={() => router.push('/drafts/new')}>
        Write a message
      </AppButton>
      {!data ? (
        <StateView
          loading={loading}
          title={loading ? 'Loading your mailboxes' : 'Mailboxes unavailable'}
          description={error || 'Checking your saved messages.'}
          actionLabel={!loading ? 'Try again' : undefined}
          onAction={() => {
            void refresh();
          }}
        />
      ) : null}
      {data ? (
        <View style={{ gap: spacing.sm }}>
          {boxes.map((box) => (
            <List.Item
              key={box}
              title={boxLabels[box]}
              description={descriptions[box]}
              descriptionNumberOfLines={3}
              accessibilityRole="button"
              accessibilityLabel={`${boxLabels[box]}, ${data.counts[box]} messages`}
              right={() => (
                <Text
                  variant="titleMedium"
                  style={{ alignSelf: 'center', color: theme.colors.primary }}
                >
                  {data.counts[box]}
                </Text>
              )}
              onPress={() =>
                router.push({ pathname: '/mailboxes', params: { box } })
              }
            />
          ))}
        </View>
      ) : null}
      {data ? (
        <>
          <Text variant="bodySmall">
            Updated {new Date(data.asOf).toLocaleString()}. Mailboxes overlap: a
            partially delivered message appears in Sent and Needs attention.
          </Text>
          {error ? (
            <Text
              accessibilityRole="alert"
              style={{ color: theme.colors.error }}
            >
              {error} These counts are from the last successful refresh.
            </Text>
          ) : null}
          <AppButton
            disabled={loading}
            loading={loading}
            onPress={() => {
              void refresh();
            }}
          >
            Refresh mailboxes
          </AppButton>
        </>
      ) : null}
      <AppButton onPress={() => router.push('/schedules')}>
        Manage schedules
      </AppButton>
      <AppButton onPress={() => router.push('/profile')}>
        Your profile
      </AppButton>
      <AppButton onPress={() => router.push('/status')}>
        Check service status
      </AppButton>
    </Screen>
  );
}
