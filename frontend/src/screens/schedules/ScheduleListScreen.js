import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { List, SegmentedButtons, Text, useTheme } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { createScheduleService } from '../../services/schedules/service';
import { scheduleLabel } from '../../services/schedules/contracts';
import { ApiError } from '../../api/client';
import AppButton from '../../components/common/AppButton';
import StateView from '../../components/common/StateView';
import { layout, spacing } from '../../theme';
export default function ScheduleListScreen() {
  const { session } = useAuth(),
    router = useRouter(),
    theme = useTheme();
  const api = useMemo(() => createScheduleService(session), [session]);
  const [status, setStatus] = useState(
    /** @type {'SCHEDULED'|'CANCELED'} */ ('SCHEDULED'),
  );
  const [page, setPage] = useState(
    /** @type {{items:import('../../services/schedules/contracts').Summary[],nextCursor:string|null}} */ ({
      items: [],
      nextCursor: null,
    }),
  );
  const [loading, setLoading] = useState(true),
    [moreLoading, setMoreLoading] = useState(false),
    [error, setError] = useState('');
  const active = useRef(/** @type {AbortController|null} */ (null));
  const paging = useRef(false);
  const refresh = useCallback(() => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    paging.current = false;
    setLoading(true);
    setMoreLoading(false);
    void api.list(status, null, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) {
          setPage(value);
          setError('');
          setLoading(false);
        }
      },
      (failure) => {
        if (!controller.signal.aborted) {
          setError(
            failure instanceof ApiError
              ? failure.message
              : 'Schedules could not be loaded.',
          );
          setLoading(false);
        }
      },
    );
  }, [api, status]);
  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => active.current?.abort();
    }, [refresh]),
  );
  const more = async () => {
    if (loading || paging.current || !page.nextCursor) return;
    const controller = active.current;
    if (!controller || controller.signal.aborted) return;
    paging.current = true;
    setMoreLoading(true);
    try {
      const next = await api.list(status, page.nextCursor, controller.signal);
      if (!controller.signal.aborted)
        setPage((old) => ({
          items: [
            ...new Map(
              [...old.items, ...next.items].map((item) => [item.id, item]),
            ).values(),
          ],
          nextCursor: next.nextCursor,
        }));
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof ApiError
            ? failure.message
            : 'More schedules could not be loaded.',
        );
    } finally {
      if (active.current === controller) {
        paging.current = false;
        if (!controller.signal.aborted) setMoreLoading(false);
      }
    }
  };
  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <FlatList
        data={page.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          width: '100%',
          maxWidth: layout.contentWidth,
          alignSelf: 'center',
          padding: spacing.lg,
          gap: spacing.md,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <AppButton onPress={() => router.replace('/')}>
              Back to Dearly
            </AppButton>
            <Text variant="headlineMedium" accessibilityRole="header">
              Your schedules
            </Text>
            <Text>
              Automatic delivery is not running yet. These are saved delivery
              plans.
            </Text>
            <SegmentedButtons
              value={status}
              onValueChange={(value) => {
                setPage({ items: [], nextCursor: null });
                setStatus(/** @type {'SCHEDULED'|'CANCELED'} */ (value));
              }}
              buttons={[
                { value: 'SCHEDULED', label: 'Scheduled' },
                { value: 'CANCELED', label: 'Canceled' },
              ]}
            />
            <AppButton onPress={() => router.push('/drafts')}>
              Choose a draft to schedule
            </AppButton>
          </View>
        }
        renderItem={({ item }) => (
          <List.Item
            title={item.subject || 'Untitled message'}
            description={`${scheduleLabel(item.scheduledFor, item.timezone)}\n${item.timezone} · ${item.status === 'CANCELED' ? 'Canceled' : 'Saved schedule'}`}
            descriptionNumberOfLines={4}
            accessibilityRole="button"
            accessibilityLabel={`Open schedule ${item.subject || 'Untitled message'}`}
            onPress={() =>
              router.push({
                pathname: '/schedules/[id]',
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
                ? 'Loading schedules'
                : error
                  ? 'Schedules unavailable'
                  : status === 'CANCELED'
                    ? 'No canceled schedules'
                    : 'No schedules yet'
            }
            description={
              error ||
              (loading
                ? 'Checking saved plans.'
                : 'Save a draft, then review its delivery time.')
            }
            actionLabel={!loading && error ? 'Try again' : undefined}
            onAction={refresh}
          />
        }
        ListFooterComponent={
          <View style={{ gap: spacing.md }}>
            {error && page.items.length ? (
              <Text accessibilityRole="alert">{error}</Text>
            ) : null}
            {page.nextCursor ? (
              <AppButton
                disabled={loading || moreLoading}
                loading={moreLoading}
                onPress={() => {
                  void more();
                }}
              >
                Load more schedules
              </AppButton>
            ) : null}
            <AppButton disabled={loading || moreLoading} onPress={refresh}>
              Refresh schedules
            </AppButton>
          </View>
        }
      />
    </SafeAreaView>
  );
}
