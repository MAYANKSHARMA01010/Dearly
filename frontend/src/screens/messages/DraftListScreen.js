import { useCallback, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { List, Text, useTheme } from 'react-native-paper';
import { useDraftWorkspace } from '../../context/DraftWorkspaceContext';
import StateView from '../../components/common/StateView';
import AppButton from '../../components/common/AppButton';
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
    <FlatList data={page.items} keyExtractor={(item) => item.id} contentContainerStyle={{ width: '100%', maxWidth: layout.contentWidth, alignSelf: 'center', padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
      ListHeaderComponent={<View style={{ gap: spacing.md }}><AppButton onPress={() => router.replace('/')}>Back to Dearly</AppButton><Text variant="headlineMedium" accessibilityRole="header">Your drafts</Text><Text>Private messages you’re still working on.</Text><AppButton mode="contained" onPress={() => router.push('/drafts/new')}>Create a draft</AppButton></View>}
      renderItem={({ item }) => <List.Item title={item.subject || 'Untitled draft'} description={`${item.textPreview || 'No message text yet'}\n${item.recipientCount} recipient${item.recipientCount === 1 ? '' : 's'} · Updated ${new Date(item.updatedAt).toLocaleDateString()}`}
        descriptionNumberOfLines={4} accessibilityRole="button" accessibilityLabel={`Open draft ${item.subject || 'Untitled draft'}`} onPress={() => router.push({ pathname: '/drafts/[id]', params: { id: item.id } })} />}
      ListEmptyComponent={<StateView loading={loading} title={loading ? 'Loading drafts' : error ? 'Drafts could not be loaded' : 'No drafts yet'} description={error || (loading ? 'Checking your saved messages.' : 'Start a thought for someone, or your future self.')}
        actionLabel={!loading && error ? 'Try again' : undefined} onAction={refresh} />}
      ListFooterComponent={<View style={{ gap: spacing.md }}>{error && page.items.length ? <Text accessibilityRole="alert">{error}</Text> : null}
        {page.nextCursor ? <AppButton loading={loadingMore} disabled={loading || loadingMore} onPress={() => { void more(); }}>Load more drafts</AppButton> : null}
        <AppButton disabled={loading || loadingMore} onPress={refresh}>Refresh drafts</AppButton></View>} />
  </SafeAreaView>;
}
