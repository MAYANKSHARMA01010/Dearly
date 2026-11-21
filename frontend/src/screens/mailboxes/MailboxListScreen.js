import SnapshotStatus from '../../components/common/SnapshotStatus';
import {useFocusedResource} from '../../hooks/useFocusedResource';
import { isAccessDenial } from '../../services/mailboxes/resource';
import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Divider,
  IconButton,
  List,
  Menu,
  SegmentedButtons,
  Text,
  useTheme,
} from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
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
import { ScreenHeading } from '../../components/layout/ScreenSections';
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
  const [boxMenu, setBoxMenu] = useState(false);
  const header = (
    <View style={{ gap: spacing.md }}>
      <Stack.Screen options={{ title: 'Mailboxes', headerBackVisible: false, headerLeft: () => <IconButton icon="arrow-left" accessibilityLabel="Back to Dearly" onPress={() => router.replace('/')} /> }} />
      <ScreenHeading title={boxLabels[box]} description="Your messages, organized by where they are in their journey." />
      <AppButton mode="contained" icon="pencil-outline" onPress={() => router.push('/drafts/new')}>Write a message</AppButton>
      <Menu visible={boxMenu} onDismiss={() => setBoxMenu(false)} anchor={<AppButton icon="chevron-down" mode="outlined" style={{ borderRadius: 12 }} contentStyle={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }} accessibilityLabel={`Choose mailbox: ${boxLabels[box]}`} onPress={() => setBoxMenu(true)}>{boxLabels[box]}</AppButton>}>
        {boxes.map((value) => <Menu.Item key={value} title={boxLabels[value]} leadingIcon={value === box ? 'check' : undefined} onPress={() => { setBox(value); setStatus(''); setRead('all'); setMenu(false); setBoxMenu(false); }} />)}
      </Menu>
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
            <AppButton icon="chevron-down" mode="outlined" style={{ borderRadius: 12 }} contentStyle={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }} onPress={() => setMenu(true)}>
              Status: {status === 'DRAFT' ? 'Draft' : status ? scheduleStatusLabel(status) : 'All'}
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
  const query=new URLSearchParams({box,limit:'20',...(status?{status}:{}),...(box==='received'?{read}:{})});
  const load=useFocusedResource(useCallback((signal,fresh)=>api.list(box,{status,read},signal,fresh),[api,box,status,read]),`/messages/mailboxes?${query}`);
  const [extra,setExtra]=useState(/** @type {{source:import('../../services/mailboxes/contracts').Page,page:import('../../services/mailboxes/contracts').Page}|null} */(null));
  const [moreLoading,setMoreLoading]=useState(false),[moreError,setMoreError]=useState('');
  const active=useRef(/** @type {AbortController|null} */(null)),paging=useRef(false);
  useEffect(()=>{
    active.current?.abort();const c=new AbortController();active.current=c;paging.current=false;
    return()=>c.abort();
  },[load.data]);
  const [source,setSource]=useState(load.data);
  if(source!==load.data){setSource(load.data);setExtra(null);setMoreLoading(false);setMoreError('');}
  const page=load.data && extra?.source===load.data?extra.page:load.data;
  const loading=load.loading,error=load.error || moreError;
  const refreshResource=load.refresh;
  const refresh=useCallback(()=>{active.current?.abort();active.current=new AbortController();paging.current=false;setMoreLoading(false);setExtra(null);setMoreError('');void refreshResource();},[refreshResource]);
  const more=async()=>{
    if(loading || paging.current || !page?.nextCursor || !load.data)return;
    const c=active.current,source=load.data;
    if(!c || c.signal.aborted)return;
    paging.current=true;setMoreLoading(true);
    try {
      const next=await api.list(box,{status,read,cursor:page.nextCursor},c.signal);
      if(!c.signal.aborted)setExtra({source,page:{...next,items:[...new Map([...page.items,...next.items].map(i=>[i.id,i])).values()]}});
    }catch(failure){
      if(!c.signal.aborted && isAccessDenial(failure))load.invalidate();
      if(!c.signal.aborted)setMoreError(failure instanceof ApiError?failure.message:'More messages could not be loaded.');
    }finally{if(active.current===c){paging.current=false;if(!c.signal.aborted)setMoreLoading(false);}}
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
        ListHeaderComponent={<View style={{gap:spacing.md}}>{header}<SnapshotStatus info={load.info} error={error} loading={loading} /></View>}
        ItemSeparatorComponent={() => <Divider />}
        renderItem={({ item }) => (
          <List.Item
            title={item.subject || 'Untitled message'}
            titleNumberOfLines={2} titleStyle={{ fontWeight: '600' }} style={{ paddingVertical: spacing.md, paddingHorizontal: 0 }}
            left={(props) => <List.Icon {...props} icon="email-outline" color={theme.colors.primary} />}
            right={(props) => <List.Icon {...props} icon="chevron-right" color={theme.colors.onSurfaceVariant} />}
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
            {page?.nextCursor ? (
              <AppButton
                mode="outlined" loading={moreLoading}
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
            <AppButton icon="refresh" disabled={loading || moreLoading} onPress={refresh}>
              Refresh messages
            </AppButton>
          </View>
        }
      />
    </SafeAreaView>
  );
}
