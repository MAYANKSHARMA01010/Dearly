import { isAccessDenial } from '../../services/mailboxes/resource';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  List,
  Menu,
  SegmentedButtons,
  Text,
  useTheme,
} from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../api/client';
import { createMailboxService } from '../../services/mailboxes/service';
import { boxes, boxLabels, states } from '../../services/mailboxes/contracts';
import {
  scheduleLabel,
  scheduleStatusLabel,
} from '../../services/schedules/contracts';
import AppButton from '../../components/common/AppButton';
import StateView from '../../components/common/StateView';
import { layout, spacing } from '../../theme';
/** @param {{initialBox:import('../../services/mailboxes/contracts').Box}} props */
export default function MailboxListScreen({ initialBox }) {
  const [box, setBox] = useState(initialBox),
    [status, setStatus] = useState(''),
    [read, setRead] = useState(
      /** @type {'all'|'opened'|'unopened'} */ ('all'),
    ),
    [menu, setMenu] = useState(false);
  const router = useRouter();
  const header = (
    <View style={{ gap: spacing.md }}>
      <AppButton onPress={() => router.replace('/')}>Back to Dearly</AppButton>
      <Text variant="headlineMedium" accessibilityRole="header">
        {boxLabels[box]}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {boxes.map((value) => (
          <AppButton
            key={value}
            mode={value === box ? 'contained' : 'outlined'}
            onPress={() => {
              setBox(value);
              setStatus('');
              setRead('all');
              setMenu(false);
            }}
          >
            {boxLabels[value]}
          </AppButton>
        ))}
      </ScrollView>
      {box === 'received' ? (
        <>
          <SegmentedButtons
            value={read}
            onValueChange={(v) =>
              setRead(/** @type {'all'|'opened'|'unopened'} */ (v))
            }
            buttons={[
              { value: 'all', label: 'All' },
              { value: 'unopened', label: 'Unmarked' },
              { value: 'opened', label: 'Opened' },
            ]}
          />
          <Text>
            You choose when to share that you opened a message. Viewing it alone
            does not mark it.
          </Text>
        </>
      ) : (
        <Menu
          visible={menu}
          onDismiss={() => setMenu(false)}
          anchor={
            <AppButton mode="outlined" onPress={() => setMenu(true)}>
              Status: {status ? scheduleStatusLabel(status) : 'All'}
            </AppButton>
          }
        >
          <Menu.Item
            title="All statuses"
            onPress={() => {
              setStatus('');
              setMenu(false);
            }}
          />
          {states.map((s) => (
            <Menu.Item
              key={s}
              title={s === 'DRAFT' ? 'Draft' : scheduleStatusLabel(s)}
              onPress={() => {
                setStatus(s);
                setMenu(false);
              }}
            />
          ))}
        </Menu>
      )}
      <AppButton onPress={() => router.push('/drafts/new')}>
        Write a message
      </AppButton>
    </View>
  );
  return (
    <MailboxFeed
      key={`${box}:${status}:${read}`}
      box={box}
      status={status}
      read={read}
      header={header}
    />
  );
}
/** @param {{box:import('../../services/mailboxes/contracts').Box,status:string,read:'all'|'opened'|'unopened',header:import('react').ReactElement}} props */
function MailboxFeed({ box, status, read, header }) {
  const { session } = useAuth(),
    router = useRouter(),
    theme = useTheme();
  const api = useMemo(() => createMailboxService(session), [session]);
  const [page, setPage] = useState(
    /** @type {import('../../services/mailboxes/contracts').Page|null} */ (
      null
    ),
  );
  const [loading, setLoading] = useState(true),
    [moreLoading, setMoreLoading] = useState(false),
    [error, setError] = useState('');
  const active = useRef(/** @type {AbortController|null} */ (null)),
    paging = useRef(false);
  const refresh = useCallback(() => {
    active.current?.abort();
    const c = new AbortController();
    active.current = c;
    paging.current = false;
    setLoading(true);
    setMoreLoading(false);
    setError('');
    void api.list(box, { status, read }, c.signal).then(
      (value) => {
        if (!c.signal.aborted) {
          setPage(value);
          setLoading(false);
        }
      },
      (failure) => {
        if (!c.signal.aborted) {
          if (isAccessDenial(failure)) setPage(null);
          setError(
            failure instanceof ApiError
              ? failure.message
              : 'This mailbox could not be loaded.',
          );
          setLoading(false);
        }
      },
    );
  }, [api, box, status, read]);
  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => active.current?.abort();
    }, [refresh]),
  );
  const more = async () => {
    if (loading || paging.current || !page?.nextCursor) return;
    const c = active.current;
    if (!c || c.signal.aborted) return;
    paging.current = true;
    setMoreLoading(true);
    try {
      const next = await api.list(
        box,
        { status, read, cursor: page.nextCursor },
        c.signal,
      );
      if (!c.signal.aborted)
        setPage((old) =>
          old
            ? {
                ...next,
                items: [
                  ...new Map(
                    [...old.items, ...next.items].map((i) => [i.id, i]),
                  ).values(),
                ],
              }
            : next,
        );
    } catch (failure) {
      if (!c.signal.aborted && isAccessDenial(failure)) setPage(null);
      if (!c.signal.aborted)
        setError(
          failure instanceof ApiError
            ? failure.message
            : 'More messages could not be loaded.',
        );
    } finally {
      if (active.current === c) {
        paging.current = false;
        if (!c.signal.aborted) setMoreLoading(false);
      }
    }
  };
  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <FlatList
        data={page?.items ?? []}
        keyExtractor={(i) => i.id}
        refreshing={loading && Boolean(page)}
        onRefresh={refresh}
        contentContainerStyle={{
          width: '100%',
          maxWidth: layout.contentWidth,
          alignSelf: 'center',
          padding: spacing.lg,
          gap: spacing.md,
          flexGrow: 1,
        }}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <List.Item
            title={item.subject || 'Untitled message'}
            titleNumberOfLines={2}
            description={`${item.status === 'DRAFT' ? 'Draft' : item.status === 'RECEIVED' ? 'Delivered to you' : item.status === 'OPENED' ? 'Marked as opened' : scheduleStatusLabel(item.status)}${item.status === 'SCHEDULED' && !item.deliveryEnabled ? ' · Paused' : ''}\n${item.scheduledFor && item.timezone ? scheduleLabel(item.scheduledFor, item.timezone) : `Created ${new Date(item.timestamp).toLocaleString()}`}${item.timezone ? `\n${item.timezone}` : ''}`}
            descriptionNumberOfLines={5}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.subject || 'Untitled message'}`}
            onPress={() =>
              router.push({
                pathname:
                  item.role === 'received'
                    ? '/mailboxes/received/[id]'
                    : '/mailboxes/owned/[id]',
                params: { id: item.id },
              })
            }
          />
        )}
        ListEmptyComponent={
          <StateView
            loading={loading}
            title={
              loading
                ? 'Loading messages'
                : error
                  ? 'Mailbox unavailable'
                  : 'No messages here yet'
            }
            description={
              error ||
              (loading
                ? 'Checking your saved messages.'
                : 'This mailbox has no messages matching your filters.')
            }
            actionLabel={!loading && error ? 'Try again' : undefined}
            onAction={refresh}
          />
        }
        ListFooterComponent={
          <View style={{ gap: spacing.md }}>
            {error && page?.items.length ? (
              <Text
                accessibilityRole="alert"
                style={{ color: theme.colors.error }}
              >
                {error} Previously loaded messages are still shown.
              </Text>
            ) : null}
            {page?.nextCursor ? (
              <AppButton
                loading={moreLoading}
                disabled={loading || moreLoading}
                onPress={() => {
                  void more();
                }}
              >
                Load more messages
              </AppButton>
            ) : null}
            {page ? (
              <Text variant="bodySmall">
                Last refreshed {new Date(page.asOf).toLocaleString()}
              </Text>
            ) : null}
            <AppButton disabled={loading || moreLoading} onPress={refresh}>
              Refresh messages
            </AppButton>
          </View>
        }
      />
    </SafeAreaView>
  );
}
