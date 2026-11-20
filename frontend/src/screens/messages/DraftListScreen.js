import { useCallback, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Divider, Icon, IconButton, List, Text, useTheme } from 'react-native-paper';
import { useDraftWorkspace } from '../../context/DraftWorkspaceContext';
import StateView from '../../components/common/StateView';
import AppButton from '../../components/common/AppButton';
import { InlineNotice, ScreenHeading } from '../../components/layout/ScreenSections';
import { ApiError } from '../../api/client';
import { layout, spacing } from '../../theme';

export default function DraftListScreen() {
  const { api } = useDraftWorkspace(); const router = useRouter(); const theme = useTheme();
  const [page, setPage] = useState(/** @type {{ items: import('../../services/drafts/contracts').DraftSummary[], nextCursor: string|null }} */ ({ items: [], nextCursor: null }));
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const active = useRef(/** @type {AbortController|null} */ (null)); const paging = useRef(false); const refreshing = useRef(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const refresh = useCallback(() => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller; paging.current = false; refreshing.current = true;
    setLoading(true); setLoadingMore(false);
    void api.list(null, controller.signal).then((value) => { if (!controller.signal.aborted) { setPage(value); setError(''); setLoading(false); refreshing.current = false; } },
      (failure) => { if (!controller.signal.aborted) { setError(failure instanceof ApiError ? failure.message : 'Drafts could not be loaded. Please try again.'); setLoading(false); refreshing.current = false; } });
  }, [api]);
  useFocusEffect(useCallback(() => { refresh(); return () => active.current?.abort(); }, [refresh]));
  const more = async () => {
    if (refreshing.current || paging.current || !page.nextCursor) return;
    const controller = active.current; if (!controller || controller.signal.aborted) return;
    paging.current = true; setLoadingMore(true); setError('');
    try {
      const next = await api.list(page.nextCursor, controller.signal);
      if (!controller.signal.aborted) setPage((old) => ({ items: [...new Map([...old.items, ...next.items].map((item) => [item.id, item])).values()], nextCursor: next.nextCursor }));
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof ApiError ? failure.message : 'More drafts could not be loaded.'); }
    finally { if (active.current === controller) { paging.current = false; if (!controller.signal.aborted) setLoadingMore(false); } }
  };
  return <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <Stack.Screen options={{ headerLeft: () => <IconButton icon="arrow-left" accessibilityLabel="Back to Dearly" onPress={() => router.replace('/')} /> }} />
    <FlatList data={page.items} keyExtractor={(item) => item.id} contentContainerStyle={{ width: '100%', maxWidth: layout.contentWidth, alignSelf: 'center', padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
      ListHeaderComponent={<View style={{ gap: spacing.lg, paddingBottom: spacing.sm }}>
        <ScreenHeading title="Your drafts" description="Private messages you’re still working on." />
        <AppButton mode="contained" icon="pencil-plus-outline" onPress={() => router.push('/drafts/new')}>Create a draft</AppButton>
      </View>}
      ItemSeparatorComponent={() => <Divider />}
      renderItem={({ item }) => <List.Item title={item.subject || 'Untitled draft'} titleNumberOfLines={2}
        titleStyle={{ fontWeight: '600' }} style={{ paddingVertical: spacing.md, paddingHorizontal: 0 }}
        description={() => <View style={{ gap: spacing.sm, paddingTop: spacing.xs }}>
          <Text variant="bodyMedium" numberOfLines={2} style={{ color: theme.colors.onSurfaceVariant }}>{item.textPreview || 'No message text yet'}</Text>
          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>{item.recipientCount} recipient{item.recipientCount === 1 ? '' : 's'} · Updated {new Date(item.updatedAt).toLocaleDateString()}</Text>
        </View>}
        left={(props) => <List.Icon {...props} icon="file-document-edit-outline" color={theme.colors.primary} />}
        right={() => <View style={{ justifyContent: 'center' }}><Icon source="chevron-right" size={20} color={theme.colors.onSurfaceVariant} /></View>}
        accessibilityRole="button" accessibilityLabel={`Open draft ${item.subject || 'Untitled draft'}, ${item.recipientCount} recipient${item.recipientCount === 1 ? '' : 's'}, updated ${new Date(item.updatedAt).toLocaleDateString()}`}
        onPress={() => router.push({ pathname: '/drafts/[id]', params: { id: item.id } })} />}
      ListEmptyComponent={<StateView loading={loading} title={loading ? 'Loading drafts' : error ? 'Drafts could not be loaded' : 'No drafts yet'} description={error || (loading ? 'Checking your saved messages.' : 'Start a thought for someone, or your future self.')}
        actionLabel={!loading && error ? 'Try again' : undefined} onAction={refresh} />}
      ListFooterComponent={<View style={{ gap: spacing.md, paddingTop: spacing.md }}>{error && page.items.length ? <InlineNotice error>{error}</InlineNotice> : null}
        {page.nextCursor ? <AppButton mode="outlined" loading={loadingMore} disabled={loading || loadingMore} onPress={() => { void more(); }}>Load more drafts</AppButton> : null}
        <AppButton icon="refresh" disabled={loading || loadingMore} onPress={refresh}>Refresh drafts</AppButton></View>} />
  </SafeAreaView>;
}
