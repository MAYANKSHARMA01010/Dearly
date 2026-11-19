import { useCallback, useMemo, useState } from 'react';
import { Text, List } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useFocusedResource } from '../../hooks/useFocusedResource';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import Screen from '../../components/layout/Screen';
import StateView from '../../components/common/StateView';
import AppButton from '../../components/common/AppButton';
import {
  createNotificationService,
  notificationLabel,
} from '../../services/notifications/service';
export default function NotificationsScreen() {
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
      <Text variant="headlineMedium" accessibilityRole="header">
        Notifications
      </Text>
      <Text>Message updates, kept in one place.</Text>
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
          <Text accessibilityLiveRegion="polite">{data.unread} unread</Text>
          {!data.items.length ? (
            <Text>No updates yet. New message activity will appear here.</Text>
          ) : null}
          {data.items.map((item) => (
            <List.Item
              key={item.id}
              title={notificationLabel(item.kind)}
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
              disabled={loading}
              onPress={() => setPages((p) => p.slice(0, -1))}
            >
              Newer updates
            </AppButton>
          ) : null}
          {data.nextCursor ? (
            <AppButton
              disabled={loading}
              onPress={() => setPages((p) => [...p, data.nextCursor])}
            >
              Older updates
            </AppButton>
          ) : null}
          <AppButton
            disabled={loading}
            onPress={() => {
              void refresh();
            }}
          >
            Refresh updates
          </AppButton>
        </>
      ) : null}
      {error || action.error ? (
        <Text accessibilityRole="alert">{error || action.error}</Text>
      ) : null}
      <AppButton onPress={() => router.push('/settings')}>
        Notification settings
      </AppButton>
    </Screen>
  );
}
