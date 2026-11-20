import { Fragment, useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { Divider, IconButton, Text, useTheme } from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useFocusedResource } from '../../hooks/useFocusedResource';
import { createMailboxService } from '../../services/mailboxes/service';
import { boxes, boxLabels } from '../../services/mailboxes/contracts';
import Screen from '../../components/layout/Screen';
import AppButton from '../../components/common/AppButton';
import StateView from '../../components/common/StateView';
import { spacing } from '../../theme';
import { ScreenHeading, ScreenSection, InsetGroup, NavigationRow, InlineNotice } from '../../components/layout/ScreenSections';
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
      created: 'Everything you’ve written',
      scheduled: 'Waiting for delivery',
      sent: 'Delivered to at least one Dearly inbox',
      received: data
        ? `${data.unopened} not marked as opened`
        : 'Messages delivered to you',
      drafts: 'Private, unfinished messages',
      failed: 'Failed or partially delivered',
    });
  const icons = { created: 'email-multiple-outline', scheduled: 'clock-outline', sent: 'send-outline', received: 'inbox-arrow-down-outline', drafts: 'file-document-edit-outline', failed: 'alert-circle-outline' };
  return <>
    <Stack.Screen options={{ headerRight: () => <View style={{ flexDirection: 'row' }}>
      <IconButton icon="bell-outline" accessibilityLabel="Notifications" onPress={() => router.push('/notifications')} />
      <IconButton icon="cog-outline" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
      <IconButton icon="account-circle-outline" accessibilityLabel="Your profile" onPress={() => router.push('/profile')} />
    </View> }} />
    <Screen>
      <ScreenHeading title={`Hello, ${user?.name || 'there'}`} description="A place for words worth keeping." />
      <AppButton mode="contained" icon="pencil-outline" onPress={() => router.push('/drafts/new')}>Write a message</AppButton>
      {!data ? <StateView loading={loading} title={loading ? 'Loading your mailboxes' : 'Mailboxes unavailable'}
        description={error || 'Checking your saved messages.'} actionLabel={!loading ? 'Try again' : undefined} onAction={() => { void refresh(); }} /> : null}
      {data ? <ScreenSection title="Your mailboxes">
        <InsetGroup>{boxes.map((box, index) => <Fragment key={box}>
          {index ? <Divider /> : null}
          <NavigationRow title={boxLabels[box]} description={descriptions[box]} icon={icons[box]} count={data.counts[box]}
            accessibilityLabel={`${boxLabels[box]}, ${data.counts[box]} messages`}
            onPress={() => router.push({ pathname: '/mailboxes', params: { box } })} />
        </Fragment>)}</InsetGroup>
        <View style={{ gap: spacing.xs }}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Updated {new Date(data.asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Mailboxes can overlap.</Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>A partially delivered message can appear in both Sent and Needs attention.</Text>
          <AppButton icon="refresh" disabled={loading} loading={loading} onPress={() => { void refresh(); }}>Refresh mailboxes</AppButton>
        </View>
        {error ? <InlineNotice error>{error} These counts are from the last successful refresh.</InlineNotice> : null}
      </ScreenSection> : null}
      <ScreenSection title="Delivery tools">
        <InsetGroup>
          <NavigationRow title="Manage schedules" description="Review upcoming and previous delivery plans" icon="calendar-clock-outline" onPress={() => router.push('/schedules')} />
          <Divider />
          <NavigationRow title="Service status" description="Check Dearly’s connection" icon="connection" onPress={() => router.push('/status')} />
        </InsetGroup>
      </ScreenSection>
    </Screen>
  </>;
}
