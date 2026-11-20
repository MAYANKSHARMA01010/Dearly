import { useCallback, useMemo, useState } from 'react';
import { Text, List, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useFocusedResource } from '../../hooks/useFocusedResource';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import Screen from '../../components/layout/Screen';
import { InlineNotice, ScreenHeading } from '../../components/layout/ScreenSections';
import { spacing } from '../../theme';
import StateView from '../../components/common/StateView';
import AppButton from '../../components/common/AppButton';
import {
  createNotificationService,
  notificationLabel,
} from '../../services/notifications/service';
export default function NotificationsScreen() {
  const theme = useTheme();
  const { session, user } = useAuth(),
    router = useRouter(),
    action = useAsyncAction();
  const api = useMemo(() => createNotificationService(session), [session]);
  const [pages, setPages] = useState(/** @type {(string|null)[]} */ ([null]));
  const cursor = pages[pages.length - 1];
  const { data, loading, error, refresh } = useFocusedResource(
    useCallback((signal) => api.list(cursor, signal), [api, cursor]),
  );
  return (
    <Screen>
      <ScreenHeading title="Notifications" description="Message updates, kept in one place." />
      {!data ? (
        <StateView
          loading={loading}
          title={loading ? 'Loading updates' : 'Updates unavailable'}
          description={error || 'Checking your notifications.'}
          actionLabel={!loading ? 'Try again' : undefined}
          onAction={() => {
            void refresh();
          }}
        />
      ) : null}
      {data ? (
        <>
          <Text variant="labelLarge" accessibilityLiveRegion="polite" style={{ color: theme.colors.onSurfaceVariant }}>{data.unread} unread</Text>
          {!data.items.length ? (
            <StateView title="No updates yet" description="New message activity will appear here." />
          ) : null}
          {data.items.map((item) => (
            <List.Item
              key={item.id}
              title={notificationLabel(item.kind)} titleNumberOfLines={2} descriptionNumberOfLines={2}
              titleStyle={{ fontWeight: item.readAt ? '400' : '600' }}
              style={{ minHeight: 80, paddingVertical: spacing.md, borderRadius: 12, backgroundColor: item.readAt ? theme.colors.background : theme.colors.secondaryContainer }}
              left={(props) => <List.Icon {...props} icon={item.readAt ? 'bell-outline' : 'bell-badge-outline'} color={theme.colors.primary} />}
              right={(props) => <List.Icon {...props} icon="chevron-right" color={theme.colors.onSurfaceVariant} />}
              description={`${item.readAt ? 'Read' : 'Unread'} · ${new Date(item.createdAt).toLocaleString()}`}
              accessibilityRole="button"
              accessibilityLabel={`${notificationLabel(item.kind)}, ${item.readAt ? 'read' : 'unread'}`}
              onPress={() => {
                void action.run(async () => {
                  const target = await api.open(item.id);
                  router.push({
                    pathname:
                      target.targetType === 'received'
                        ? '/mailboxes/received/[id]'
                        : '/mailboxes/owned/[id]',
                    params: { id: target.targetId },
                  });
                });
              }}
              disabled={action.busy || !user}
            />
          ))}
          {pages.length > 1 ? (
            <AppButton
              mode="outlined" disabled={loading}
              onPress={() => setPages((p) => p.slice(0, -1))}
            >
              Newer updates
            </AppButton>
          ) : null}
          {data.nextCursor ? (
            <AppButton
              mode="outlined" disabled={loading}
              onPress={() => setPages((p) => [...p, data.nextCursor])}
            >
              Older updates
            </AppButton>
          ) : null}
          <AppButton
            icon="refresh" disabled={loading}
            onPress={() => {
              void refresh();
            }}
          >
            Refresh updates
          </AppButton>
        </>
      ) : null}
      {(data && error) || action.error ? (
        <InlineNotice error>{error || action.error}</InlineNotice>
      ) : null}
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Opening an update marks the notification as read. Sharing a message’s opened status remains your choice.</Text>
      <AppButton icon="cog-outline" onPress={() => router.push('/settings')}>
        Notification settings
      </AppButton>
    </Screen>
  );
}
